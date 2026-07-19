#!/usr/bin/env bash
#
# Relay server installer — runtime binary + the whole stack on one machine.
#
#   curl -fsSL https://raw.githubusercontent.com/termdx/Relay/main/scripts/install-server.sh \
#     | bash -s -- --domain relay.youragency.com
#
# What it does:
#   1. downloads the relay-runtime binary + portal bundle from the latest
#      GitHub release (built by the `dist` branch CI)
#   2. pulls the backend image from GHCR and tags it for the runtime's compose
#   3. installs the runtime as a service (systemd on Linux) with a generated
#      RELAY_RUNTIME_TOKEN — the desktop connects with this token
#   4. with --domain: serves the client portal at https://<domain> via Caddy
#      (automatic TLS) and proxies the API paths to the backend
#
# Flags:
#   --domain <relay.agency.com>   host the client portal (needs DNS → this box)
#   --repo   <owner/repo>         GitHub repo to install from (default termdx/Relay)
set -euo pipefail

REPO="termdx/Relay"
DOMAIN=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

say() { printf '\033[35m[relay]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[relay]\033[0m %s\n' "$*" >&2; exit 1; }

# ── prerequisites ────────────────────────────────────────────────────────────
command -v docker >/dev/null || die "Docker is required. Install it first: https://docs.docker.com/engine/install/"
docker info >/dev/null 2>&1 || die "Docker is installed but not running."
command -v curl >/dev/null || die "curl is required."

OS=$(uname -s); ARCH=$(uname -m)
case "$OS-$ARCH" in
  Linux-x86_64)  TRIPLE="x86_64-unknown-linux-gnu" ;;
  Darwin-arm64)  TRIPLE="aarch64-apple-darwin" ;;
  *) die "unsupported platform: $OS $ARCH (builds exist for Linux x64 and macOS arm64)" ;;
esac

# ── download release assets ─────────────────────────────────────────────────
say "fetching latest release from $REPO…"
RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")
asset_url() {
  echo "$RELEASE_JSON" | grep -o "\"browser_download_url\": *\"[^\"]*$1[^\"]*\"" | head -1 | cut -d'"' -f4
}

BIN_URL=$(asset_url "relay-runtime-$TRIPLE")
PORTAL_URL=$(asset_url "portal-dist.tar.gz")
[ -n "$BIN_URL" ] || die "no relay-runtime-$TRIPLE asset in the latest release — push to the dist branch first."

say "installing runtime binary → /usr/local/bin/relay-runtime"
SUDO=""; [ -w /usr/local/bin ] || SUDO="sudo"
curl -fsSL "$BIN_URL" -o /tmp/relay-runtime
$SUDO install -m 0755 /tmp/relay-runtime /usr/local/bin/relay-runtime

# ── backend image ───────────────────────────────────────────────────────────
# The runtime's compose references relay-backend:local. Prefer GHCR; fall
# back to the release tarball when the package is private (org policy).
OWNER=$(echo "$REPO" | cut -d/ -f1 | tr '[:upper:]' '[:lower:]')
if docker pull "ghcr.io/$OWNER/relay-backend:latest" 2>/dev/null; then
  say "backend image pulled from GHCR."
  docker tag "ghcr.io/$OWNER/relay-backend:latest" relay-backend:local
else
  IMG_URL=$(asset_url "relay-backend-image.tar.gz")
  [ -n "$IMG_URL" ] || die "GHCR pull failed and the release has no image tarball."
  say "GHCR is private — downloading the image from the release instead…"
  curl -fsSL "$IMG_URL" | gunzip | docker load
  docker tag relay-backend:release relay-backend:local
fi

# ── runtime service ─────────────────────────────────────────────────────────
# Re-runs keep the existing token so already-connected desktops stay valid.
# (The env file is root-owned mode 600 — read it with sudo.)
RUNTIME_TOKEN=$($SUDO cat /etc/relay/runtime.env 2>/dev/null | grep '^RELAY_RUNTIME_TOKEN=' | cut -d= -f2 || true)
if [ -n "$RUNTIME_TOKEN" ]; then
  say "reusing existing runtime token."
else
  RUNTIME_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
fi
$SUDO mkdir -p /etc/relay
printf 'RELAY_RUNTIME_TOKEN=%s\n' "$RUNTIME_TOKEN" | $SUDO tee /etc/relay/runtime.env >/dev/null
[ -n "$DOMAIN" ] && printf 'RELAY_PUBLIC_URL=https://%s\n' "$DOMAIN" | $SUDO tee -a /etc/relay/runtime.env >/dev/null
$SUDO chmod 600 /etc/relay/runtime.env

if [ "$OS" = "Linux" ] && command -v systemctl >/dev/null; then
  say "installing systemd service relay-runtime…"
  $SUDO tee /etc/systemd/system/relay-runtime.service >/dev/null <<UNIT
[Unit]
Description=Relay runtime daemon
After=network-online.target docker.service
Requires=docker.service

[Service]
EnvironmentFile=/etc/relay/runtime.env
ExecStart=/usr/local/bin/relay-runtime
Restart=always
RestartSec=3
User=$(id -un)

[Install]
WantedBy=multi-user.target
UNIT
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable relay-runtime >/dev/null 2>&1
  $SUDO systemctl restart relay-runtime
else
  say "no systemd — start the daemon manually:"
  say "  RELAY_RUNTIME_TOKEN=$RUNTIME_TOKEN relay-runtime &"
  (RELAY_RUNTIME_TOKEN="$RUNTIME_TOKEN" nohup relay-runtime >/tmp/relay-runtime.log 2>&1 &)
fi

say "waiting for the daemon…"
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:51720/health >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS http://127.0.0.1:51720/health >/dev/null || die "daemon did not come up — check logs."

WORKSPACE="$HOME/.relay/workspaces/default"
rpc() { # rpc <json-path-array> <json-args-array>
  curl -fsS -X POST http://127.0.0.1:51720/rpc \
    -H "content-type: application/json" -H "x-relay-token: $RUNTIME_TOKEN" \
    -d "{\"path\":$1,\"args\":$2}"
}

# A fresh workspace has no modules — install the base module that carries
# the backend + postgres services, then bring the compose stack up.
say "installing the base module (backend + postgres)…"
rpc '["modules","add"]' "[\"$WORKSPACE\",\"projects\",true]" >/dev/null

say "starting the stack (postgres + backend)…"
rpc '["runtime","up"]' "[\"$WORKSPACE\"]" >/dev/null

say "waiting for the backend…"
for _ in $(seq 1 36); do
  curl -fsS -m 3 http://127.0.0.1:3000/health >/dev/null 2>&1 && break
  sleep 5
done
curl -fsS -m 5 http://127.0.0.1:3000/health >/dev/null || die "backend did not become healthy — check: docker logs relay-backend-1"

# ── portal at the domain ────────────────────────────────────────────────────
if [ -n "$DOMAIN" ]; then
  [ -n "$PORTAL_URL" ] || die "release has no portal-dist.tar.gz asset."
  say "installing portal for https://$DOMAIN…"
  $SUDO mkdir -p /opt/relay/portal
  curl -fsSL "$PORTAL_URL" | $SUDO tar xz -C /opt/relay/portal

  # Mirror the desktop bundles — teammates download from the agency's own
  # domain (fast, local) instead of GitHub's CDN at https://<domain>/downloads/
  say "mirroring desktop bundles → /downloads/…"
  $SUDO mkdir -p /opt/relay/downloads
  for pat in ".dmg" ".deb"; do
    u=$(asset_url "$pat"); [ -n "$u" ] || continue
    f=$(basename "$u")
    # Always refresh — the file name stays the same across releases but the
    # contents don't.
    curl -fsSL "$u" -o /tmp/relay-mirror-asset
    $SUDO mv /tmp/relay-mirror-asset "/opt/relay/downloads/$f"
    # Stable names so links never break across releases.
    case "$pat" in
      .dmg) $SUDO cp -f "/opt/relay/downloads/$f" /opt/relay/downloads/Relay.dmg ;;
      .deb) $SUDO cp -f "/opt/relay/downloads/$f" /opt/relay/downloads/relay-desktop.deb ;;
    esac
  done
  $SUDO tee /etc/relay/Caddyfile >/dev/null <<CADDY
$DOMAIN {
  encode gzip
  @api path /portal/* /approve/* /webhooks/* /branding
  handle @api {
    reverse_proxy localhost:3000
  }
  # Full backend API for the desktop app: https://<domain>/api → backend
  handle_path /api/* {
    reverse_proxy localhost:3000
  }
  # Runtime daemon for the desktop app (token-gated): https://<domain>/runtime
  handle_path /runtime/* {
    reverse_proxy localhost:51720
  }
  # Desktop app downloads, mirrored from the release at install time.
  handle_path /downloads/* {
    root * /srv/downloads
    file_server browse
  }
  handle {
    root * /srv/portal
    try_files {path} /index.html
    file_server
  }
}
CADDY
  docker rm -f relay-caddy >/dev/null 2>&1 || true
  docker run -d --name relay-caddy --restart unless-stopped --network host \
    -v /etc/relay/Caddyfile:/etc/caddy/Caddyfile:ro \
    -v /opt/relay/portal:/srv/portal:ro \
    -v /opt/relay/downloads:/srv/downloads:ro \
    -v relay_caddy_data:/data \
    caddy:2 >/dev/null
  say "portal live at https://$DOMAIN (TLS auto-provisions on first hit; DNS must point here)"
fi

# ── done ────────────────────────────────────────────────────────────────────
say ""
say "───────────────────────────────────────────────────────────"
say "Relay server installed."
say "  runtime daemon : http://127.0.0.1:51720 (token-protected)"
say "  runtime token  : $RUNTIME_TOKEN"
[ -n "$DOMAIN" ] && say "  client portal  : https://$DOMAIN"
say ""
say "Connect the desktop app: Settings → Agency server →"
if [ -n "$DOMAIN" ]; then
  say "  Backend URL : https://$DOMAIN/api"
  say "  Runtime URL : https://$DOMAIN/runtime"
else
  say "  Backend URL : http://<this-host>:3000"
  say "  Runtime URL : http://<this-host>:51720   (expose via VPN/SSH tunnel, or proxy it)"
fi
say "  Token       : $RUNTIME_TOKEN"
say "───────────────────────────────────────────────────────────"
