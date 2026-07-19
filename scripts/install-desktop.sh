#!/usr/bin/env bash
#
# Relay desktop installer — downloads the latest desktop bundle.
#
#   # from your agency's Relay server (fast — mirrored on their domain):
#   curl -fsSL https://raw.githubusercontent.com/termdx/Relay/main/scripts/install-desktop.sh \
#     | bash -s -- --server https://relay.youragency.com
#
#   # or straight from GitHub releases:
#   curl -fsSL https://raw.githubusercontent.com/termdx/Relay/main/scripts/install-desktop.sh | bash
#
set -euo pipefail

REPO="${RELAY_REPO:-termdx/Relay}"
SERVER="${RELAY_SERVER:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --server) SERVER="${2%/}"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

say() { printf '\033[35m[relay]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[relay]\033[0m %s\n' "$*" >&2; exit 1; }

github_asset_url() {
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o "\"browser_download_url\": *\"[^\"]*$1[^\"]*\"" | head -1 | cut -d'"' -f4
}

# Prefer the agency server's mirror (same region, no CDN throttling);
# fall back to the GitHub release.
fetch() { # fetch <mirror-name> <github-suffix> <dest>
  if [ -n "$SERVER" ] && curl -fL --progress-bar "$SERVER/downloads/$1" -o "$3"; then
    return 0
  fi
  [ -n "$SERVER" ] && say "mirror unavailable — falling back to GitHub releases…"
  URL=$(github_asset_url "$2")
  [ -n "$URL" ] || die "no $2 in the latest release — push to the dist branch first."
  say "downloading $(basename "$URL")…"
  curl -fL --progress-bar "$URL" -o "$3"
}

OS=$(uname -s)
case "$OS" in
  Darwin)
    fetch "Relay.dmg" ".dmg" /tmp/Relay.dmg
    say "opening the installer — drag Relay into Applications."
    open /tmp/Relay.dmg
    ;;
  Linux)
    fetch "relay-desktop.deb" ".deb" /tmp/relay-desktop.deb
    say "installing (needs sudo)…"
    sudo apt-get install -y /tmp/relay-desktop.deb || sudo dpkg -i /tmp/relay-desktop.deb
    say "installed — launch 'Relay' from your app menu."
    ;;
  *) die "unsupported platform: $OS" ;;
esac

say "First run: Settings → Agency server to connect to a hosted Relay,"
say "or run the full local stack with pnpm dev from a source checkout."
