#!/usr/bin/env bash
# End-to-end install check for a packed DigiClip Setup (macOS / Linux):
#   payload version → headless install → files + OS integration → the
#   installed app boots its bundled engine → uninstall leaves nothing behind.
#
#   smoke-unix.sh <setup-binary> <expected-version>
set -euo pipefail
setup="$1"
want="$2"
fail() { echo "::error::$*"; exit 1; }

# Run "$@" for at most $1 seconds (macOS has no `timeout`).
with_timeout() {
    local secs=$1; shift
    "$@" & local pid=$!
    for _ in $(seq "$secs"); do
        kill -0 "$pid" 2>/dev/null || { wait "$pid"; return $?; }
        sleep 1
    done
    kill "$pid" 2>/dev/null || true
    return 124
}

echo "== payload"
info=$("$setup" --payload-info)
echo "$info"
[ "${info%% *}" = "$want" ] || fail "Setup carries '${info%% *}', expected $want"

echo "== install"
"$setup" --install
detect=$("$setup" --detect)
echo "$detect"
case "$detect" in *"installed=true version=$want "*) ;; *) fail "detect after install: $detect" ;; esac

case "$(uname -s)" in
Darwin)
    app=/Applications/DigiClip.app
    [ -x "$app/Contents/MacOS/digiclip-app" ] || fail "missing $app/Contents/MacOS/digiclip-app"
    engine="$app/Contents/Resources/resources/digiclip"
    launch=("$app/Contents/MacOS/digiclip-app")
    ;;
Linux)
    dir="$HOME/.local/opt/digiclip"
    [ -x "$dir/app/AppRun" ] || fail "missing $dir/app/AppRun"
    engine=$(find "$dir/app" -path '*/resources/digiclip' -type f | head -n1)
    data="${XDG_DATA_HOME:-$HOME/.local/share}"
    # Named after the window class so GNOME picks it over any other entry
    # claiming `digiclip-app`; the icon name is unique to this install.
    desktop="$data/applications/digiclip-app.desktop"
    grep -q "Exec=\"$dir/app/AppRun\"" "$desktop" || fail "desktop entry: $(cat "$desktop")"
    grep -qx "Icon=com.digiclip.app" "$desktop" || fail "desktop icon: $(cat "$desktop")"
    icon="$data/icons/hicolor/128x128/apps/com.digiclip.app.png"
    [ -f "$icon" ] || fail "icon missing: $(find "$data/icons" -type f)"
    launch=(xvfb-run -a "$dir/app/AppRun")
    ;;
*) fail "unsupported OS" ;;
esac
[ -n "$engine" ] && [ -x "$engine" ] || fail "bundled engine missing or not executable"
"$engine" --version

echo "== launch installed app (engine boot check)"
report="$(mktemp -d)/smoke.txt"
DIGICLIP_SMOKE_TEST="$report" with_timeout 120 "${launch[@]}" || echo "app exited with $?"
[ -f "$report" ] || fail "installed app never reported (did not boot)"
cat "$report"
grep -q '^ok ' "$report" || fail "installed app could not boot its engine"

echo "== uninstall"
"$setup" --uninstall --quiet
detect=$("$setup" --detect)
echo "$detect"
case "$detect" in *"installed=false"*) ;; *) fail "still installed after uninstall: $detect" ;; esac
case "$(uname -s)" in
Darwin) [ ! -e /Applications/DigiClip.app ] || fail "DigiClip.app left behind" ;;
Linux)
    [ ! -e "$HOME/.local/opt/digiclip" ] || fail "install dir left behind: $(ls -la "$HOME/.local/opt/digiclip")"
    [ ! -e "$desktop" ] || fail "desktop entry left behind"
    [ ! -e "$icon" ] || fail "icon left behind"
    ;;
esac
echo "smoke OK"
