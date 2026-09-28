#!/usr/bin/env bash
# Notarize a signed bundle and staple the ticket to it, so Gatekeeper
# accepts it offline.
#
#   notarize-macos.sh <bundle.app>
#
# Needs APPLE_ID, APPLE_TEAM_ID and APPLE_APP_PASSWORD (an app-specific
# password); a no-op without them.
set -euo pipefail
app="$1"

if [ -z "${APPLE_ID:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ] || [ -z "${APPLE_APP_PASSWORD:-}" ]; then
  echo "notarization skipped (APPLE_ID / APPLE_TEAM_ID / APPLE_APP_PASSWORD not set)"
  exit 0
fi

zip="$RUNNER_TEMP/notarize-$(basename "$app" .app | tr ' ' '-').zip"
ditto -c -k --keepParent "$app" "$zip"
xcrun notarytool submit "$zip" \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" --password "$APPLE_APP_PASSWORD" \
  --wait --timeout 30m
xcrun stapler staple "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose "$app"
rm -f "$zip"
