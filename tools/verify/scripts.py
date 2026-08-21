#!/usr/bin/env python3
"""index.html's <script> block against what is actually in js/.

That list is the only place outside a feature's own file where a feature
appears, so forgetting a line is the one mistake this architecture still lets
you make — and it fails at run time, in a browser, far from the edit. Nothing
in the page can see the filesystem, so the check lives out here and runs before
the harness does.

usage: scripts.py [project-dir]   — exits 1 and says what is wrong
"""
import sys, pathlib, re

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                   else pathlib.Path(__file__).resolve().parents[2])
listed = re.findall(r'<script src="(js/[^"]+)">', (src / 'index.html').read_text())
disk = sorted(str(p.relative_to(src)) for p in (src / 'js').rglob('*.js'))

bad = [f'listed but not on disk: {f}' for f in listed if f not in disk]
bad += [f'on disk but not in index.html: {f}' for f in disk if f not in listed]
bad += [f'listed twice: {f}' for f in sorted(set(listed)) if listed.count(f) > 1]

if bad:
    print('SCRIPT LIST out of step with js/:')
    for b in bad:
        print('  ' + b)
    sys.exit(1)
print(f'script list: {len(listed)} files, all accounted for')
