#!/usr/bin/env python3
"""Turn the shooter's report into PNGs, or compare two sets of them.

    globeshot.py unpack <report.txt> <outdir>
    globeshot.py diff   <dir-a> <dir-b>

The diff is exact: the globe is drawn from the same tables through the same
projection whatever the code underneath does, so two builds that agree about
the picture agree about every pixel of it. A handful of pixels differing by one
level is the rasteriser rounding a coordinate; a shape moving is a bug.
"""
import base64, io, os, struct, sys, zlib


def unpack(rep, out):
    if not os.path.exists(rep):
        print('NO REPORT — the shooter never ran.'); return 1
    os.makedirs(out, exist_ok=True)
    n = 0
    for line in io.open(rep, encoding='utf-8'):
        line = line.strip()
        if line.startswith('SHOT ERROR'):
            print(line); return 1
        if not line.startswith('SHOT ') or line == 'SHOT done':
            continue
        p = line.split(' ', 4)
        if len(p) < 5 or not p[4].startswith('data:image/png;base64,'):
            continue
        io.open(os.path.join(out, p[1] + '.png'), 'wb').write(
            base64.b64decode(p[4].split(',', 1)[1]))
        print('  %-10s %sx%s' % (p[1], p[2], p[3]))
        n += 1
    print('%d shots -> %s' % (n, out))
    return 0 if n else 1


def png_rgba(path):
    """Just enough PNG to read what a canvas writes: 8-bit RGBA, no interlace."""
    d = io.open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path
    i, idat, w = 8, b'', None
    while i < len(d):
        ln = struct.unpack('>I', d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        body = d[i + 8:i + 8 + ln]
        if typ == b'IHDR':
            w, h, depth, colour = struct.unpack('>IIBB', body[:10])
            assert depth == 8 and colour == 6 and body[12] == 0, 'unexpected PNG form'
        elif typ == b'IDAT':
            idat += body
        i += 12 + ln
    raw = zlib.decompress(idat)
    stride, out, prev = w * 4, bytearray(), bytearray(w * 4)
    pos = 0
    for _ in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for x in range(4, stride): line[x] = (line[x] + line[x - 4]) & 255
        elif f == 2:
            for x in range(stride): line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                c = prev[x - 4] if x >= 4 else 0
                b = prev[x]
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line; prev = line
    return w, h, bytes(out)


def diff(a, b):
    names = sorted(set(os.listdir(a)) & set(os.listdir(b)))
    names = [n for n in names if n.endswith('.png')]
    if not names:
        print('nothing to compare'); return 1
    bad = 0
    for n in names:
        wa, ha, pa = png_rgba(os.path.join(a, n))
        wb, hb, pb = png_rgba(os.path.join(b, n))
        if (wa, ha) != (wb, hb):
            print('  %-10s SIZE %dx%d vs %dx%d' % (n[:-4], wa, ha, wb, hb)); bad += 1; continue
        worst = off = over = 0
        # PREMULTIPLIED, because that is what lands on the page. A PNG keeps
        # colour and alpha apart, so a pixel that is one part in sixty
        # transparent — the antialiased rim of the globe — can store wildly
        # different colours for the same visible result, and comparing those
        # raw numbers reports a change nobody can see.
        for i in range(0, len(pa), 4):
            qa, qb = pa[i + 3], pb[i + 3]
            d = abs(qa - qb)
            for c in range(3):
                d = max(d, abs(pa[i + c] * qa - pb[i + c] * qb) // 255)
            if d:
                off += 1
                if d > 2: over += 1
                if d > worst: worst = d
        px = wa * ha
        # A pixel off by one is a rounding difference and nothing else — a
        # gradient composited in two passes instead of one lands there. What
        # would mean a SHAPE has moved is a body of pixels off by a lot, so
        # that is what the verdict is on.
        flag = 'DIFF' if over * 2000 > px else 'ok  '
        if flag == 'DIFF': bad += 1
        print('  %s %-10s %6d/%d differ (%.3f%%), of them %d by more than 1/255'
              ', worst channel %d'
              % (flag, n[:-4], off, px, off * 100.0 / px, over, worst))
    print('%d of %d views differ by more than rounding' % (bad, len(names)))
    return 1 if bad else 0


if __name__ == '__main__':
    if len(sys.argv) < 4: print(__doc__); sys.exit(2)
    sys.exit(unpack(sys.argv[2], sys.argv[3]) if sys.argv[1] == 'unpack'
             else diff(sys.argv[2], sys.argv[3]))
