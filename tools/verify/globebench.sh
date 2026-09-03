#!/usr/bin/env bash
# Time the live globe's canvas in headless Firefox and print the report.
# usage: globebench.sh [project-dir]
#
# It is the same rig as run.sh — a copy of the app served from a scratch
# directory with one extra script appended — but the script it appends is a
# stopwatch rather than a checklist. Run it before a change and after one; the
# number that matters is the p95, because that is the frame a hand feels.
set -u
SRC="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RUN="$HERE/bench"
PORT="${PORT:-8733}"

rm -rf "$RUN"; mkdir -p "$RUN"
cp -r "$SRC"/index.html "$RUN"/ 2>/dev/null
[ -d "$SRC/js" ]  && cp -r "$SRC/js"  "$RUN"/
[ -d "$SRC/css" ] && cp -r "$SRC/css" "$RUN"/
[ -d "$SRC/fonts" ] && cp -r "$SRC/fonts" "$RUN"/
cp "$HERE/globebench.js" "$RUN"/

python3 - "$RUN/index.html" <<'PY'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
inject = ('<img src="/slow?ms=60000" alt="" style="position:fixed;left:-9999px;width:1px;height:1px">\n'
          '<script src="globebench.js"></script>\n')
assert '</body>' in s, 'no </body> in index.html'
io.open(p, 'w', encoding='utf-8').write(s.replace('</body>', inject + '</body>'))
PY

rm -f "$RUN/report.txt"
python3 "$HERE/serve.py" "$RUN" "$PORT" &
SRV=$!
sleep 1

PROF="$HERE/benchprof"; rm -rf "$PROF"; mkdir -p "$PROF"
# performance.now() is rounded to the millisecond by default, and a whole
# millisecond is most of the budget being measured here. This profile is thrown
# away at the end of the run and never browses anything.
cat > "$PROF/user.js" <<'PREFS'
user_pref("privacy.reduceTimerPrecision", false);
user_pref("gfx.webrender.all", true);
user_pref("toolkit.telemetry.enabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
PREFS
timeout 180 firefox --headless --profile "$PROF" --no-remote \
  --window-size=1400,1000 --screenshot "$RUN/shot.png" \
  "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1

kill "$SRV" 2>/dev/null
wait "$SRV" 2>/dev/null
rm -rf "$PROF"

echo "================ GLOBE ================"
[ -f "$RUN/report.txt" ] && cat "$RUN/report.txt" || echo "NO REPORT — the bench never ran."
