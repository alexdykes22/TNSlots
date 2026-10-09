#!/usr/bin/env python3
"""Bundle index.html + js/*.js into ONE self-contained file: vols-power-link.html"""
import os
import re

here = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(here, "index.html"), encoding="utf-8").read()


def inline(m):
    src = m.group(1)
    code = open(os.path.join(here, src), encoding="utf-8").read().replace("</script", "<\\/script")
    return f"<script>\n/* {src} */\n{code}\n</script>"


html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
out = os.path.join(here, "vols-power-link.html")
open(out, "w", encoding="utf-8").write(html)
print("wrote", out, f"{len(html) / 1024:.0f} KB")
