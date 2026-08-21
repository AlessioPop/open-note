#!/usr/bin/env bash
# Drive the shipped Electron shell and print a report.
# usage: desktop.sh [project-dir]
#
# Companion to run.sh, which does the same job in a browser. This one covers what
# only exists once there is a window: the custom origin, books surviving a restart,
# type set with the network unplugged, and script load order.
#
# Needs `npm install` first. On a headless machine (CI) it wraps itself in xvfb.
set -u
SRC="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$HERE/run-desktop"
ELECTRON="$SRC/node_modules/.bin/electron"

if [ ! -x "$ELECTRON" ]; then
  echo "No Electron — run 'npm install' in $SRC first." >&2
  exit 2
fi

rm -rf "$WORK"; mkdir -p "$WORK"

# A copy of the app with a resize fired the instant core/keys.js has installed
# its resize listener — while forty more scripts are still loading. That is the
# load-order race made deterministic: refit() reaches for repaintModels(), which
# items/media/model.js has not defined yet.
mkdir -p "$WORK/race"
cp "$SRC/index.html" "$WORK/race/"
cp -r "$SRC/js" "$WORK/race/"
[ -d "$SRC/fonts" ] && cp -r "$SRC/fonts" "$WORK/race/"
python3 - "$WORK/race/index.html" <<'PY'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
tag = '<script src="js/core/keys.js"></script>'
assert tag in s, 'core/keys.js is no longer in index.html — fix desktop.sh'
io.open(p, 'w', encoding='utf-8').write(
    s.replace(tag, tag + '\n<script>window.dispatchEvent(new Event("resize"));</script>'))
PY

# Electron needs a display; CI has none. --no-sandbox because the SUID helper is
# not configured on a runner, and it is the test harness, not the shipped app.
WRAP=""
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  if command -v xvfb-run >/dev/null 2>&1; then WRAP="xvfb-run -a"
  else echo "No display and no xvfb-run — install xvfb." >&2; exit 2; fi
fi
FLAGS=""
[ -n "${CI:-}" ] && FLAGS="--no-sandbox"

REPORT="$WORK/report.txt"; : > "$REPORT"

phase(){                        # phase <name> <profile> [extra env]
  local name="$1" profile="$2"; shift 2
  local raw
  raw="$(PHASE="$name" PROFILE="$WORK/$profile" RACE_APP="$WORK/race" \
         $WRAP timeout 180 "$ELECTRON" "$HERE/desktop.js" $FLAGS 2>/dev/null \
         | sed -n '/@@REPORT@@/,$p' | tail -n +2)"
  if [ -z "$raw" ]; then
    echo "FAIL  [$name] the phase produced no report (it crashed or timed out)" >> "$REPORT"
  else
    echo "$raw" | sed "s/^\(PASS\|FAIL\)  /\1  [$name] /" >> "$REPORT"
  fi
}

phase boot    profile-a          # a fresh library
phase boot    profile-a          # …and again, same profile: did it survive?
phase note    profile-b
phase offline profile-c
phase race    profile-d

# Two boots of one profile must report the same note. Different ids mean the
# library was rebuilt from scratch, which is silent data loss.
IDENTS="$(grep -c '^----  IDENT' "$REPORT" || true)"
UNIQ="$(grep '^----  IDENT' "$REPORT" | sort -u | wc -l)"
if [ "$IDENTS" -ge 2 ] && [ "$UNIQ" -eq 1 ]; then
  echo "PASS  [persist] the same note came back after a full restart" >> "$REPORT"
else
  echo "FAIL  [persist] the library did not survive a restart ($IDENTS boots, $UNIQ distinct)" >> "$REPORT"
fi

echo "================ REPORT ================"
grep -c '^PASS' "$REPORT" | sed 's/^/PASS count: /'
grep -c '^FAIL' "$REPORT" | sed 's/^/FAIL count: /'
echo "---------------- failures ----------------"
grep '^FAIL' "$REPORT" || echo "(none)"
grep -q '^FAIL' "$REPORT" && exit 1
exit 0
