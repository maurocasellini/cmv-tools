# Third-party licenses

CMV Tools (this repository) is licensed under the AGPL-3.0 – see `LICENSE`. The tools self-host the following
open-source components. Each component’s full license text is in its source repository; where a package includes
a license file, it is also shipped in the tool’s `vendor/` folder.
The same list is shown at https://tools.cmventures.xyz/#licenses.

| Component | Version | License | Used in | Source |
|---|---|---|---|---|
| MuPDF / PyMuPDF | 1.28.2 | AGPL-3.0 | PDF Toolkit | https://github.com/pymupdf/PyMuPDF |
| Pyodide (Python for WebAssembly) | 0.29.5 | MPL-2.0 | PDF Toolkit | https://github.com/pyodide/pyodide |
| NumPy | 2.2.5 | BSD-3-Clause | PDF Toolkit | https://github.com/numpy/numpy |
| Pillow | 11.3.0 | MIT-CMU (HPND) | PDF Toolkit | https://github.com/python-pillow/Pillow |
| OpenCV.js (@techstark/opencv-js) | 5.0.0 | Apache-2.0 | Doc Scanner | https://github.com/TechStark/opencv-js |
| Tesseract.js | 7.0.0 | Apache-2.0 | Doc Scanner | https://github.com/naptha/tesseract.js |
| Tesseract.js core (Tesseract OCR) | 7.0.0 | Apache-2.0 | Doc Scanner | https://github.com/naptha/tesseract.js-core |
| Tesseract language data (deu, eng) | 4.0.0_best_int | Apache-2.0 | Doc Scanner | https://github.com/tesseract-ocr/tessdata_best |
| pdf-lib | 1.17.1 | MIT | Doc Scanner | https://github.com/Hopding/pdf-lib |
| Whisper speech recognition model (OpenAI), ONNX conversion Xenova/whisper-tiny, -base | – | MIT | Voice to Text | https://github.com/openai/whisper |
| Transformers.js | 4.3.0 | Apache-2.0 | Voice to Text | https://github.com/huggingface/transformers.js |
| ONNX Runtime Web | 1.31.0-dev | MIT | Voice to Text, Image Toolkit | https://github.com/microsoft/onnxruntime |
| ffmpeg.wasm | 0.12.15 | MIT | Voice to Text, Video Toolkit | https://github.com/ffmpegwasm/ffmpeg.wasm |
| FFmpeg core for WebAssembly (incl. x264, LAME) | 0.12.10 | GPL-2.0-or-later | Voice to Text, Video Toolkit | https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core |
| jSquash codecs (Squoosh: MozJPEG, libwebp, libavif, OxiPNG) | jpeg 1.6.0 · webp 1.5.0 · avif 2.1.1 · oxipng 2.3.0 | Apache-2.0 | Image Toolkit | https://github.com/jamsinclair/jSquash |
| wasm-feature-detect | 1.9.0 | Apache-2.0 | Image Toolkit | https://github.com/GoogleChromeLabs/wasm-feature-detect |
| libheif-js | 1.23.5 | LGPL-3.0 | Image Toolkit | https://github.com/catdad-experiments/libheif-js |
| exifr | 7.1.3 | MIT | Image Toolkit | https://github.com/MikeKovarik/exifr |
| IS-Net background removal model (IMG.LY) | 1.4.5 | AGPL-3.0 | Image Toolkit | https://github.com/imgly/background-removal-js |
| YuNet face detection model (OpenCV Zoo) | 2023mar | MIT | Image Toolkit | https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet |
| Bergamot Translator | 0.4.9 | MPL-2.0 | Translator | https://github.com/browsermt/bergamot-translator |
| Firefox Translations models (de, fr, it, es ↔ en) | 0.3.3 | MPL-2.0 | Translator | https://github.com/mozilla/firefox-translations-models |
| qrcode-generator | 2.0.4 | MIT | QR Codes | https://github.com/kazuhikoarase/qrcode-generator |
| world-atlas (Natural Earth 1:110m land outlines) | 2.0.2 | ISC · data public domain | Time Zones | https://github.com/topojson/world-atlas |
| IANA time zone database – zone coordinates (zone1970.tab) | 2026b | Public domain | Time Zones | https://www.iana.org/time-zones |
| IBM Plex Sans & Mono (fonts) | – | OFL-1.1 | all tools | https://github.com/IBM/plex |
| Source Serif 4 (font) | – | OFL-1.1 | all tools | https://github.com/adobe-fonts/source-serif |
| Great Vibes, Dancing Script, Allura (signature fonts) | – | OFL-1.1 | PDF Toolkit | https://fonts.google.com/attribution |
| Liberation fonts (text in PDFs) | – | OFL-1.1 | PDF Toolkit | https://github.com/liberationfonts/liberation-fonts |

The CM Ventures Blockchain Demo uses no third-party code.
