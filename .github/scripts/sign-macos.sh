#!/usr/bin/env bash
# Sign a macOS bundle: every Mach-O inside it (the engine sits in
# Resources, where --deep doesn't look), then the bundle itself.
#
#   sign-macos.sh <bundle.app>
#
# With APPLE_SIGN_ID set (a Developer ID Application identity in the
# keychain set up by the workflow): hardened runtime + secure timestamp,
# ready for notarization. Without it: ad-hoc, as before.
set -euo pipefail
app="$1"

if [ -n "${APPLE_SIGN_ID:-}" ]; then
  sign=(codesign --force --options runtime --timestamp --sign "$APPLE_SIGN_ID")
else
  sign=(codesign --force --sign -)
fi

# Inside out: nested code first, the bundle seal last.
while IFS= read -r -d '' f; do
  if file -b "$f" | grep -q 'Mach-O'; then
    "${sign[@]}" "$f"
  fi
done < <(find "$app/Contents" -type f -perm -u+x -not -path '*/Contents/MacOS/*' -print0)

"${sign[@]}" "$app"
codesign --verify --deep --strict --verbose=2 "$app"
