#!/usr/bin/env bash
# Drive the app in headless Firefox and print the probe's report.
# usage: run.sh [project-dir]
set -u
SRC="${1:-$(cd "$(dirname "$0")/../.." && pwd)}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RUN="$HERE/run"
PORT="${PORT:-8731}"

# the one list nobody can forget — see scripts.py
python3 "$HERE/scripts.py" "$SRC" || exit 1

rm -rf "$RUN"; mkdir -p "$RUN"
cp -r "$SRC"/index.html "$RUN"/ 2>/dev/null
[ -d "$SRC/js" ]  && cp -r "$SRC/js"  "$RUN"/
[ -d "$SRC/css" ] && cp -r "$SRC/css" "$RUN"/
# the type is local now — without this the run 404s fonts/fonts.css and sets the
# whole app in fallback faces, which quietly changes every measurement
[ -d "$SRC/fonts" ] && cp -r "$SRC/fonts" "$RUN"/
cp "$HERE/probe.js" "$RUN"/

# hold the load event open (the screenshot/exit fires on load) and add the probe
python3 - "$RUN/index.html" <<'PY'
import sys, io
p = sys.argv[1]
s = io.open(p, encoding='utf-8').read()
inject = ('<img src="/slow?ms=45000" alt="" style="position:fixed;left:-9999px;width:1px;height:1px">\n'
          '<script src="probe.js"></script>\n')
assert '</body>' in s, 'no </body> in index.html'
s = s.replace('</body>', inject + '</body>')
# catch load-time errors from the very first script onwards
early = ('<script>window.__errs=[];addEventListener("error",function(e){'
         '__errs.push((e.message||e.type)+" @"+String(e.filename||"").split("/").pop()+":"+e.lineno);'
         '},true);addEventListener("unhandledrejection",function(e){'
         '__errs.push("unhandled rejection: "+((e.reason&&e.reason.message)||e.reason));});</script>\n')
assert '<head>' in s, 'no <head> in index.html'
s = s.replace('<head>', '<head>\n' + early, 1)
io.open(p, 'w', encoding='utf-8').write(s)
PY

rm -f "$RUN/report.txt"
python3 "$HERE/serve.py" "$RUN" "$PORT" &
SRV=$!
sleep 1

PROF="$HERE/prof"; rm -rf "$PROF"; mkdir -p "$PROF"
timeout 120 firefox --headless --profile "$PROF" --no-remote \
  --window-size=1400,1000 --screenshot "$RUN/shot.png" \
  "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1

kill "$SRV" 2>/dev/null
wait "$SRV" 2>/dev/null

echo "================ REPORT ================"
if [ -f "$RUN/report.txt" ]; then
  # the probe posts twice; keep the longest report and drop duplicates
  sort -u "$RUN/report.txt" | grep -c '^PASS' | sed 's/^/PASS count: /'
  sort -u "$RUN/report.txt" | grep -c '^FAIL' | sed 's/^/FAIL count: /'
  echo "---------------- failures ----------------"
  sort -u "$RUN/report.txt" | grep '^FAIL' || echo "(none)"
else
  echo "NO REPORT — the probe never ran."
fi
