#!/usr/bin/env python3
"""Generates THIRD_PARTY_LICENSES.md from hub/licenses.json (the hub shows the same list on its licenses page).
Update hub/licenses.json when a dependency changes, then run:  python3 make_licenses.py"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {"all": "all tools", "pdf": "PDF Toolkit", "scan": "Doc Scanner", "voice": "Voice to Text", "image": "Image Toolkit",
         "video": "Video Toolkit", "translate": "Translator", "qr": "QR Codes", "safe": "File Safe", "time": "Time Zones"}

items = json.load(open(os.path.join(HERE, "hub", "licenses.json"), encoding="utf-8"))
lines = [
    "# Third-party licenses",
    "",
    "CMV Tools (this repository) is licensed under the AGPL-3.0 – see `LICENSE`. The tools self-host the following",
    "open-source components. Each component’s full license text is in its source repository; where a package includes",
    "a license file, it is also shipped in the tool’s `vendor/` folder.",
    "The same list is shown at https://tools.cmventures.xyz/#licenses.",
    "",
    "| Component | Version | License | Used in | Source |",
    "|---|---|---|---|---|",
]
for it in items:
    used = ", ".join(NAMES.get(t, t) for t in it["tools"])
    lines.append(f"| {it['name']} | {it['version']} | {it['license']} | {used} | {it['source']} |")
lines += ["", "The CM Ventures Blockchain Demo uses no third-party code.", ""]
open(os.path.join(HERE, "THIRD_PARTY_LICENSES.md"), "w", encoding="utf-8").write("\n".join(lines))
print("THIRD_PARTY_LICENSES.md:", len(items), "components")
