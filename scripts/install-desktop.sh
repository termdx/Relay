#!/usr/bin/env bash
#
# Relay desktop installer — downloads the latest desktop bundle.
#
#   curl -fsSL https://raw.githubusercontent.com/termdx/Relay/main/scripts/install-desktop.sh | bash
#
set -euo pipefail

REPO="${RELAY_REPO:-termdx/Relay}"
say() { printf '\033[35m[relay]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[relay]\033[0m %s\n' "$*" >&2; exit 1; }

RELEASE_JSON=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")
asset_url() {
  echo "$RELEASE_JSON" | grep -o "\"browser_download_url\": *\"[^\"]*$1[^\"]*\"" | head -1 | cut -d'"' -f4
}

OS=$(uname -s)
case "$OS" in
  Darwin)
    URL=$(asset_url ".dmg")
    [ -n "$URL" ] || die "no .dmg in the latest release — push to the dist branch first."
    say "downloading $(basename "$URL")…"
    curl -fsSL "$URL" -o /tmp/Relay.dmg
    say "opening the installer — drag Relay into Applications."
    open /tmp/Relay.dmg
    ;;
  Linux)
    URL=$(asset_url ".AppImage")
    [ -n "$URL" ] || die "no .AppImage in the latest release — push to the dist branch first."
    mkdir -p "$HOME/.local/bin"
    say "installing → ~/.local/bin/relay-desktop"
    curl -fsSL "$URL" -o "$HOME/.local/bin/relay-desktop"
    chmod +x "$HOME/.local/bin/relay-desktop"
    say "run it with: relay-desktop"
    ;;
  *) die "unsupported platform: $OS" ;;
esac

say "First run: Settings → Agency server to connect to a hosted Relay,"
say "or run the full local stack with pnpm dev from a source checkout."
