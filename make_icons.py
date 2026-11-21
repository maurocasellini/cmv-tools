#!/usr/bin/env python3
"""Renders each app's logo.svg into the PNG icons used by browsers/home screens
(<app>/icons/). Development helper – needs Playwright + Chromium:  python3 tools/make_icons.py"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
APPS = [a for a in sys.argv[1:]] or ["hub", "scan"]
NAVY = "#242b41"
CHROME = os.environ.get("CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
        pg = await b.new_page(device_scale_factor=1)
        for app in APPS:
            with open(os.path.join(HERE, app, "logo.svg"), encoding="utf-8") as fh:
                svg = fh.read()
            out = os.path.join(HERE, app, "icons")
            os.makedirs(out, exist_ok=True)
            for size, inset, name in [(180, 0, "icon-180"), (192, 0, "icon-192"), (512, 0, "icon-512"), (512, 0.1, "icon-maskable-512")]:
                pad = round(size * inset)
                bg = NAVY if inset else "transparent"
                # apple-touch icons get rounded by iOS itself: fill the square
                full = name == "icon-180"
                html = f"""<html><body style="margin:0;background:{bg if not full else NAVY}">
                <div style="width:{size}px;height:{size}px;padding:{pad}px;box-sizing:border-box">
                {svg.replace('<svg ', f'<svg style="width:100%;height:100%;display:block" ', 1) if not full else svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ', 1).replace('rx="14"', 'rx="0"')}
                </div></body></html>"""
                await pg.set_viewport_size({"width": size, "height": size})
                await pg.set_content(html)
                await pg.screenshot(path=os.path.join(out, name + ".png"), omit_background=not inset and not full)
            print("icons:", app)
        await b.close()

asyncio.run(main())
