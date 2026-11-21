"""Browser counterpart of app.py: the same functions, but without a server.
Runs in Pyodide (Python in the browser, WebAssembly). Files live only in the
browser tab's memory (/work) and never leave the device."""
import json
import os
import uuid

import pymupdf

import pdftools

WORK = "/work"
os.makedirs(WORK, exist_ok=True)
FILES = {}

# Tools not available in the browser (they need external programs)
UNAVAILABLE = {"ocr", "office_to_pdf", "pdf_to_word", "pdf_to_office"}


def describe(entry):
    out = {k: entry[k] for k in ("id", "name", "size")}
    if entry["name"].lower().endswith(".pdf"):
        try:
            doc = pymupdf.open(entry["path"])
            out["encrypted"] = bool(doc.needs_pass)
            if not doc.needs_pass:
                out["pages"] = doc.page_count
                out["sizes"] = [[round(p.rect.width, 2), round(p.rect.height, 2)] for p in doc]
            doc.close()
        except Exception:
            out["broken"] = True
    return out


def register(path, name):
    fid = uuid.uuid4().hex[:12]
    FILES[fid] = {"id": fid, "path": path, "name": name, "size": os.path.getsize(path)}
    return describe(FILES[fid])


def new_path(name):
    return os.path.join(WORK, uuid.uuid4().hex + os.path.splitext(name)[1].lower())


def file_info(fid):
    e = FILES.get(fid)
    return json.dumps(describe(e)) if e else None


def file_entry(fid):
    e = FILES.get(fid)
    return json.dumps(e) if e else None


def page_image(fid, n, width):
    """Page thumbnail (PNG when small, JPEG when large) – or None."""
    e = FILES.get(fid)
    if not e:
        return None
    try:
        doc = pymupdf.open(e["path"])
        if doc.needs_pass:
            return None
        page = doc[n]
        zoom = min(width / page.rect.width, 6)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        if width > 500:
            return ("image/jpeg", pix.tobytes("jpg", jpg_quality=88))
        return ("image/png", pix.tobytes("png"))
    except Exception:
        ext = os.path.splitext(e["name"])[1].lower()
        if ext in pdftools.IMAGE_EXT:
            with open(e["path"], "rb") as fh:
                return ("image/" + ext.lstrip(".").replace("jpg", "jpeg"), fh.read())
        return None


def run_tool(tool, body_json):
    """Like POST /api/run/<tool> – returns (status, json)."""
    if tool in UNAVAILABLE or tool not in pdftools.TOOLS:
        return 404, json.dumps({"error": "Dieses Werkzeug ist in der Web-Version nicht verfügbar."})
    body = json.loads(body_json or "{}")
    files = [FILES[f] for f in body.get("files", []) if f in FILES]
    if not files:
        return 400, json.dumps({"error": "Bitte zuerst eine Datei hinzufügen."})
    try:
        res = pdftools.TOOLS[tool](files, body.get("params") or {})
    except pdftools.ToolError as ex:
        return 400, json.dumps({"error": str(ex)})
    except MemoryError:
        return 500, json.dumps({"error": "Zu wenig Arbeitsspeicher im Browser für diese Datei."})
    except Exception as ex:
        import traceback
        traceback.print_exc()
        return 500, json.dumps({"error": f"Unerwarteter Fehler: {ex}"})
    if "json" in res:
        return 200, json.dumps({"result": res["json"]})
    res["name"] = pdftools.localize_name(res["name"], (body.get("params") or {}).get("_lang"))
    path = new_path(res["name"])
    with open(path, "wb") as fh:
        fh.write(res["data"])
    info = register(path, res["name"])
    info["info"] = res.get("info")
    info["input_size"] = sum(f["size"] for f in files)
    return 200, json.dumps({"result": info})


def forget(fid):
    """Remove a file from memory."""
    e = FILES.pop(fid, None)
    if e:
        try:
            os.remove(e["path"])
        except OSError:
            pass
