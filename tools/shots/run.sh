#!/usr/bin/env bash
# Rebuild the pictures in README.md from the real app, in headless Firefox.
#
#   tools/shots/run.sh            every scene
#   tools/shots/run.sh molecules  just that one
#
# One Firefox per scene, because --screenshot fires once, on the load event.
# tools/verify/serve.py holds that event open with /slow while scenes.js builds
# the arrangement; when the hold runs out the page finishes loading and the shot
# is taken. Output lands in docs/img/.
set -u
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
RUN="$HERE/run"
OUT="$SRC/docs/img"
PORT="${PORT:-8741}"
HOLD_MS="${HOLD_MS:-9000}"
W="${W:-1440}"; H="${H:-900}"

SCENES="${*:-canvas molecules nuclides data logic}"

command -v firefox >/dev/null || { echo "firefox not found" >&2; exit 2; }

rm -rf "$RUN"; mkdir -p "$RUN" "$OUT"
cp "$SRC/index.html" "$RUN/"
cp -r "$SRC/js" "$RUN/"
cp -r "$SRC/fonts" "$RUN/"            # without these every measurement is a fallback face
cp "$HERE/scenes.js" "$RUN/"

python3 - "$RUN/index.html" "$HOLD_MS" <<'PY'
import sys, io
p, ms = sys.argv[1], sys.argv[2]
s = io.open(p, encoding='utf-8').read()
assert '</body>' in s, 'no </body> in index.html'
s = s.replace('</body>',
    '<img src="/slow?ms=%s" alt="" style="position:fixed;left:-9999px;width:1px;height:1px">\n'
    '<script src="scenes.js"></script>\n</body>' % ms)
io.open(p, 'w', encoding='utf-8').write(s)
PY

rm -f "$RUN/report.txt"
python3 "$SRC/tools/verify/serve.py" "$RUN" "$PORT" &
SRV=$!
trap 'kill "$SRV" 2>/dev/null' EXIT
sleep 1

for scene in $SCENES; do
  printf '%-12s ' "$scene"
  PROF="$RUN/prof-$scene"; rm -rf "$PROF"; mkdir -p "$PROF"
  # a fresh profile every time: an empty IndexedDB means boot.js makes one new
  # note and opens it, which is the blank sheet every scene starts from
  timeout 120 firefox --headless --profile "$PROF" --no-remote \
    --window-size="$W,$H" --screenshot "$OUT/$scene.png" \
    "http://127.0.0.1:$PORT/index.html?scene=$scene" >/dev/null 2>&1
  if [ -f "$OUT/$scene.png" ]; then
    # lossless: strip the metadata and recompress. Quantising to a palette would
    # halve it again, but it bands the desk's gradient, and a README picture is
    # not worth a visible artefact.
    command -v magick >/dev/null &&
      magick "$OUT/$scene.png" -strip -define png:compression-level=9 "$OUT/$scene.png"
    echo "$(grep "SHOT $scene" "$RUN/report.txt" | tail -1 | sed "s/SHOT $scene //")" \
         "· $(du -h "$OUT/$scene.png" | cut -f1)"
  else
    echo "NO SHOT — the scene never finished"
  fi
done

echo
echo "written to docs/img/"
ls -1sh "$OUT"
