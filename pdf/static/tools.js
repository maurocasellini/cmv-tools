// Tool definitions: the home page and all option forms are generated from these.
const PDF = '.pdf,application/pdf';
const IMG = 'image/*,.heic';
const OFFICE = '.doc,.docx,.odt,.rtf,.txt,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.html,.htm';

const PAGES_FIELD = { name: 'pages', label: 'Seiten', type: 'text', placeholder: 'leer = alle, z. B. 1-3, 5, 8-ende' };

const CATEGORIES = [
  { name: 'Am häufigsten gebraucht', tools: ['compress', 'merge', 'sign', 'fill', 'edit', 'remove'] },
  { name: 'Bearbeiten & Unterschreiben', tools: ['edit', 'sign', 'fill', 'scan', 'watermark', 'page_numbers', 'crop', 'flatten', 'metadata'] },
  { name: 'Organisieren', tools: ['merge', 'split', 'remove', 'extract', 'organize', 'rotate'] },
  { name: 'Optimieren', tools: ['compress', 'repair', 'ocr', 'grayscale'] },
  { name: 'In PDF umwandeln', tools: ['images_to_pdf', 'office_to_pdf'] },
  { name: 'Aus PDF umwandeln', tools: ['pdf_to_images', 'pdf_to_word', 'pdf_to_office', 'extract_text', 'extract_images'] },
  { name: 'Sicherheit & Prüfen', tools: ['protect', 'unlock', 'redact', 'compare'] },
];

const TOOLS = {
  edit: {
    title: 'PDF bearbeiten', icon: '✏️', color: '#7c3aed', view: 'editor',
    desc: 'Text, Bilder, Häkchen, Formen, Abdecken und Schwärzen – direkt auf der Seite.',
  },
  sign: {
    title: 'PDF unterschreiben', icon: '✍️', color: '#0f766e', view: 'editor', openSignature: true,
    desc: 'Unterschrift zeichnen, tippen oder als Bild einfügen – optional als „Scan“ ausgeben.',
  },
  fill: {
    title: 'Formular ausfüllen', keywords: 'formular felder antrag anmeldung ausfuellen fill form', icon: '🧾', color: '#0369a1', accept: PDF, custom: 'form',
    desc: 'PDF-Formulare direkt in den Feldern ausfüllen – Text, Häkchen und Auswahllisten.',
    fields: [{ name: 'flatten', label: 'Danach fest einbrennen (Felder nicht mehr änderbar)', type: 'checkbox', default: false }],
  },
  scan: {
    title: 'Wie gescannt', icon: '🖨️', color: '#57534e', accept: PDF,
    desc: 'Lässt das PDF aussehen, als wäre es ausgedruckt und eingescannt worden (leicht schief, Rauschen, Papierton).',
    fields: [
      { name: 'intensity', label: 'Stärke', type: 'cards', default: 'mittel', options: [
        ['leicht', 'Leicht', 'Kaum sichtbar, sehr sauber'], ['mittel', 'Mittel', 'Typischer Bürokopierer'], ['stark', 'Stark', 'Alter Scanner, deutlich schief'] ] },
      { name: 'color', label: 'Farbe', type: 'select', default: 'gray', options: [['gray', 'Graustufen'], ['color', 'Farbe'], ['bw', 'Schwarz-Weiss (Fax-Look)']] },
      { name: 'dpi', label: 'Auflösung', type: 'select', default: '150', options: [['100', '100 dpi (klein)'], ['150', '150 dpi (Standard)'], ['200', '200 dpi'], ['300', '300 dpi (gross)']] },
    ],
  },
  watermark: {
    title: 'Wasserzeichen', icon: '💧', color: '#0284c7', accept: PDF, picker: true,
    desc: 'Text oder Bild über bzw. hinter den Inhalt legen.',
    fields: [
      { name: 'kind', label: 'Art', type: 'select', default: 'text', options: [['text', 'Text'], ['image', 'Bild']] },
      { name: 'text', label: 'Text', type: 'text', default: 'VERTRAULICH', showIf: { kind: 'text' } },
      { name: 'image', label: 'Bild', type: 'image', showIf: { kind: 'image' } },
      { name: 'imgscale', label: 'Bildbreite (% der Seite)', type: 'number', default: 40, showIf: { kind: 'image' } },
      { name: 'size', label: 'Schriftgrösse', type: 'number', default: 60, showIf: { kind: 'text' } },
      { name: 'color', label: 'Farbe', type: 'color', default: '#cc0000', showIf: { kind: 'text' } },
      { name: 'angle', label: 'Winkel (°)', type: 'number', default: 45, showIf: { kind: 'text' } },
      { name: 'opacity', label: 'Deckkraft', type: 'range', default: 30, min: 5, max: 100, unit: '%' },
      { name: 'layout', label: 'Anordnung', type: 'select', default: 'center', options: [['center', 'Einmal mittig'], ['tiled', 'Gekachelt (ganze Seite)']] },
      { name: 'layer', label: 'Ebene', type: 'select', default: 'over', options: [['over', 'Über dem Inhalt'], ['behind', 'Hinter dem Inhalt']] },
      PAGES_FIELD,
    ],
  },
  page_numbers: {
    title: 'Seitenzahlen', icon: '#️⃣', color: '#4f46e5', accept: PDF, picker: true,
    desc: 'Seitenzahlen hinzufügen – Position, Format und Startnummer frei wählbar.',
    fields: [
      { name: 'position', label: 'Position', type: 'select', default: 'bottom-center', options: [
        ['bottom-center', 'Unten Mitte'], ['bottom-right', 'Unten rechts'], ['bottom-left', 'Unten links'],
        ['top-center', 'Oben Mitte'], ['top-right', 'Oben rechts'], ['top-left', 'Oben links']] },
      { name: 'format', label: 'Format', type: 'text', default: 'Seite {n} von {total}', hint: '{n} = Seitenzahl, {total} = Gesamtzahl' },
      { name: 'start', label: 'Erste Nummer', type: 'number', default: 1 },
      { name: 'size', label: 'Schriftgrösse', type: 'number', default: 10 },
      { name: 'margin', label: 'Randabstand (mm)', type: 'number', default: 10 },
      { name: 'color', label: 'Farbe', type: 'color', default: '#333333' },
      PAGES_FIELD,
    ],
  },
  crop: {
    title: 'PDF zuschneiden', icon: '✂️', color: '#be123c', accept: PDF, picker: true,
    desc: 'Ränder abschneiden (in Millimetern).',
    fields: [
      { name: 'top', label: 'Oben (mm)', type: 'number', default: 10 },
      { name: 'right', label: 'Rechts (mm)', type: 'number', default: 10 },
      { name: 'bottom', label: 'Unten (mm)', type: 'number', default: 10 },
      { name: 'left', label: 'Links (mm)', type: 'number', default: 10 },
      PAGES_FIELD,
    ],
  },
  flatten: {
    title: 'PDF verflachen', icon: '🥞', color: '#78716c', accept: PDF,
    desc: 'Formularfelder und Kommentare fest einbrennen, damit nichts mehr verändert werden kann.',
  },
  metadata: {
    title: 'Metadaten', icon: '🏷️', color: '#a16207', accept: PDF,
    desc: 'Titel, Autor usw. ändern oder alle Metadaten entfernen.',
    fields: [
      { name: 'clear', label: 'Alle Metadaten entfernen', type: 'checkbox', default: false },
      { name: 'title', label: 'Titel', type: 'text', showIf: { clear: false } },
      { name: 'author', label: 'Autor', type: 'text', showIf: { clear: false } },
      { name: 'subject', label: 'Betreff', type: 'text', showIf: { clear: false } },
      { name: 'keywords', label: 'Stichwörter', type: 'text', showIf: { clear: false } },
    ],
  },
  merge: {
    title: 'PDF zusammenfügen', icon: '🧩', color: '#e5322d', accept: PDF + ',' + IMG, multiple: true, sortable: true,
    desc: 'Mehrere PDFs (und Bilder) in der gewünschten Reihenfolge zu einem PDF kombinieren. Reihenfolge per Ziehen ändern.',
    fields: [{ name: 'bookmarks', label: 'Lesezeichen pro Datei anlegen', type: 'checkbox', default: false }],
  },
  split: {
    title: 'PDF teilen', icon: '🪓', color: '#ea580c', accept: PDF,
    desc: 'Ein PDF in mehrere Dateien aufteilen.',
    fields: [
      { name: 'mode', label: 'Aufteilen', type: 'select', default: 'ranges', options: [['ranges', 'Nach Bereichen'], ['every', 'Alle N Seiten'], ['single', 'Jede Seite einzeln']] },
      { name: 'ranges', label: 'Bereiche', type: 'text', placeholder: '1-3, 4-6, 7-ende', hint: 'Jeder Bereich wird eine eigene Datei.', showIf: { mode: 'ranges' } },
      { name: 'every', label: 'Seiten pro Datei', type: 'number', default: 2, showIf: { mode: 'every' } },
    ],
  },
  remove: {
    title: 'Seiten entfernen', icon: '🗑️', color: '#dc2626', accept: PDF, picker: true,
    desc: 'Einzelne Seiten aus dem PDF löschen. Seiten anklicken oder eingeben.',
    fields: [{ ...PAGES_FIELD, label: 'Zu entfernende Seiten', placeholder: 'z. B. 2, 5-7' }],
  },
  extract: {
    title: 'Seiten extrahieren', icon: '📤', color: '#16a34a', accept: PDF, picker: true,
    desc: 'Ausgewählte Seiten in ein neues PDF übernehmen.',
    fields: [
      { ...PAGES_FIELD, label: 'Zu übernehmende Seiten', placeholder: 'z. B. 1, 3-4' },
      { name: 'separate', label: 'Jede Seite als eigene Datei (ZIP)', type: 'checkbox', default: false },
    ],
  },
  organize: {
    title: 'PDF organisieren', icon: '🗂️', color: '#d97706', accept: PDF, multiple: true, custom: 'organize',
    desc: 'Seiten per Ziehen sortieren, drehen, duplizieren, löschen oder leere Seiten einfügen. Auch über mehrere PDFs hinweg.',
  },
  rotate: {
    title: 'PDF drehen', icon: '🔄', color: '#9333ea', accept: PDF, picker: true,
    desc: 'Alle oder einzelne Seiten drehen.',
    fields: [
      { name: 'angle', label: 'Drehung', type: 'select', default: '90', options: [['90', '90° im Uhrzeigersinn'], ['180', '180°'], ['270', '90° gegen den Uhrzeigersinn']] },
      PAGES_FIELD,
    ],
  },
  compress: {
    title: 'PDF komprimieren', keywords: 'verkleinern kleiner grösse grosse mb reduzieren compress', icon: '🗜️', color: '#059669', accept: PDF,
    desc: 'PDF kleiner machen – z. B. 50 MB auf 5 MB. Zielgrösse eingeben, den Rest erledigt die App.',
    fields: [
      { name: 'level', label: 'Methode', type: 'cards', default: 'ziel', options: [
        ['ziel', 'Zielgrösse', 'Auf eine bestimmte Grösse in MB bringen'], ['empfohlen', 'Empfohlen', 'Gute Qualität, viel kleiner'],
        ['niedrig', 'Gering', 'Beste Qualität, etwas kleiner'], ['extrem', 'Stark', 'Kleinste Datei, sichtbarer Qualitätsverlust'] ] },
      { name: 'target_mb', label: 'Zielgrösse (MB)', type: 'number', default: 5, hint: 'Typisch: 5 MB für E-Mail-Anhänge, 2 MB für Upload-Portale.', showIf: { level: 'ziel' } },
      { name: 'allow_raster', label: 'Notfalls Seiten in Bilder umwandeln, um das Ziel zu erreichen', type: 'checkbox', default: true, showIf: { level: 'ziel' } },
      { name: 'gray', label: 'In Graustufen umwandeln (noch kleiner)', type: 'checkbox', default: false },
    ],
  },
  repair: {
    title: 'PDF reparieren', icon: '🩹', color: '#0891b2', accept: PDF,
    desc: 'Beschädigte oder fehlerhafte PDFs neu aufbauen.',
  },
  ocr: {
    title: 'OCR – Text erkennen', icon: '🔎', color: '#2563eb', accept: PDF, needs: 'ocr',
    desc: 'Gescannte PDFs durchsuchbar und kopierbar machen (unsichtbare Textebene).',
    fields: [
      { name: 'lang', label: 'Sprache', type: 'select', default: 'deu+eng', options: [['deu+eng', 'Deutsch + Englisch'], ['deu', 'Deutsch'], ['eng', 'Englisch'], ['fra', 'Französisch'], ['ita', 'Italienisch'], ['deu+eng+fra+ita', 'DE + EN + FR + IT']] },
      { name: 'only_empty', label: 'Nur Seiten ohne vorhandenen Text', type: 'checkbox', default: true },
    ],
  },
  grayscale: {
    title: 'In Graustufen', icon: '🌗', color: '#525252', accept: PDF,
    desc: 'Farbiges PDF in Schwarz-Weiss/Graustufen umwandeln (Seiten werden zu Bildern).',
    fields: [{ name: 'dpi', label: 'Auflösung', type: 'select', default: '150', options: [['100', '100 dpi'], ['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi']] }],
  },
  images_to_pdf: {
    title: 'Bilder in PDF', icon: '🖼️', color: '#ca8a04', accept: IMG, multiple: true, sortable: true,
    desc: 'JPG, PNG, HEIC & Co. zu einem PDF zusammenfassen.',
    fields: [
      { name: 'size', label: 'Seitengrösse', type: 'select', default: 'a4', options: [['a4', 'A4'], ['letter', 'US Letter'], ['a5', 'A5'], ['a3', 'A3'], ['fit', 'Wie das Bild']] },
      { name: 'orientation', label: 'Ausrichtung', type: 'select', default: 'auto', options: [['auto', 'Automatisch'], ['portrait', 'Hochformat'], ['landscape', 'Querformat']] },
      { name: 'margin', label: 'Rand (mm)', type: 'number', default: 0 },
    ],
  },
  office_to_pdf: {
    title: 'Office in PDF', icon: '📄', color: '#1d4ed8', accept: OFFICE, multiple: true, needs: 'office',
    desc: 'Word, Excel, PowerPoint, OpenDocument, HTML und Text in PDF umwandeln.',
    fields: [{ name: 'merge', label: 'Mehrere Dateien zu einem PDF zusammenfügen', type: 'checkbox', default: false }],
  },
  pdf_to_images: {
    title: 'PDF in Bilder', icon: '📸', color: '#d97706', accept: PDF, picker: true,
    desc: 'Jede Seite als JPG oder PNG speichern.',
    fields: [
      { name: 'format', label: 'Format', type: 'select', default: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG']] },
      { name: 'dpi', label: 'Auflösung', type: 'select', default: '150', options: [['72', '72 dpi'], ['150', '150 dpi'], ['200', '200 dpi'], ['300', '300 dpi (Druck)']] },
      PAGES_FIELD,
    ],
  },
  pdf_to_word: {
    title: 'PDF in Word', icon: '📝', color: '#2563eb', accept: PDF, needs: 'pdf2docx',
    desc: 'PDF in ein bearbeitbares Word-Dokument (.docx) umwandeln.',
  },
  pdf_to_office: {
    title: 'PDF in PowerPoint / Excel', icon: '📊', color: '#c2410c', accept: PDF,
    desc: 'PowerPoint: jede Seite wird eine Folie. Excel/ODT über LibreOffice (experimentell).',
    fields: [{ name: 'target', label: 'Ziel', type: 'select', default: 'pptx', options: [['pptx', 'PowerPoint (.pptx)'], ['xlsx', 'Excel (.xlsx) – benötigt LibreOffice'], ['odt', 'OpenDocument Text (.odt) – benötigt LibreOffice']] }],
  },
  extract_text: {
    title: 'Text extrahieren', icon: '🔤', color: '#334155', accept: PDF,
    desc: 'Den gesamten Text als .txt-Datei speichern.',
  },
  extract_images: {
    title: 'Bilder extrahieren', icon: '🧲', color: '#0d9488', accept: PDF,
    desc: 'Alle im PDF eingebetteten Bilder in Originalqualität herauslösen.',
  },
  protect: {
    title: 'PDF schützen', icon: '🔒', color: '#1e293b', accept: PDF,
    desc: 'Mit Passwort verschlüsseln (AES-256).',
    fields: [
      { name: 'password', label: 'Passwort', type: 'password' },
      { name: 'password2', label: 'Passwort wiederholen', type: 'password' },
      { name: 'allow_print', label: 'Drucken erlauben', type: 'checkbox', default: true },
      { name: 'allow_copy', label: 'Kopieren erlauben', type: 'checkbox', default: true },
      { name: 'allow_edit', label: 'Bearbeiten erlauben', type: 'checkbox', default: false },
    ],
  },
  unlock: {
    title: 'PDF entsperren', icon: '🔓', color: '#65a30d', accept: PDF,
    desc: 'Passwortschutz und Einschränkungen entfernen (Passwort nötig, falls zum Öffnen verlangt).',
    fields: [{ name: 'password', label: 'Passwort (falls bekannt)', type: 'password' }],
  },
  redact: {
    title: 'Schwärzen', icon: '⬛', color: '#000000', accept: PDF,
    desc: 'Begriffe dauerhaft entfernen – der Text ist danach wirklich weg, nicht nur überdeckt. Freie Bereiche: im Editor „Schwärzen“ verwenden.',
    fields: [
      { name: 'terms', label: 'Begriffe (einer pro Zeile)', type: 'textarea', placeholder: 'Max Muster\n079 123 45 67' },
      { name: 'emails', label: 'Alle E-Mail-Adressen', type: 'checkbox', default: false },
      { name: 'iban', label: 'Alle IBANs', type: 'checkbox', default: false },
      { name: 'phones', label: 'Alle Telefonnummern', type: 'checkbox', default: false },
    ],
  },
  compare: {
    title: 'PDFs vergleichen', icon: '⚖️', color: '#7e22ce', accept: PDF, multiple: true, custom: 'compare', max: 2,
    desc: 'Zwei Versionen nebeneinander vergleichen – Unterschiede im Text werden hervorgehoben.',
  },
};

// ---------------------------------------------------------------- Line icons (24×24, outline)
// One string = one path; prefix “F:” = filled shape.
const DOC = ['M6 2.5h8.5L19 7v14.5H6z', 'M14.5 2.5V7H19'];
const ICONS = {
  edit: ['M5 21.5V2.5h9.5L19 7v3', 'M14.5 2.5V7H19', 'M5 21.5h5', 'M12.5 21.5l.6-2.9 6.4-6.4 2.3 2.3-6.4 6.4z'],
  fill: [...DOC, 'M8.5 10h7', 'M8.5 13.5h7', 'M8.5 17l1.5 1.5 3-3'],
  sign: ['M3 16c1.8-5.5 3.6-8.6 4.8-8 1.5.8-2.2 8.3-.3 8.5 1.6.2 2.8-4.6 4.2-4.5 1.3.1.6 4 2.4 4 1.4 0 2.2-2 3.3-2 .9 0 1.4 1 2.6 1', 'M3 20.5h18'],
  scan: [...DOC, 'M2.5 13.5h19', 'M9 9.5h6', 'M9 17.5h4'],
  watermark: ['M12 3s6.5 7.2 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.2 12 3 12 3z', 'M9 15.5a3 3 0 0 0 3 3'],
  page_numbers: [...DOC, 'M10.5 11l-1 7', 'M14 11l-1 7', 'M8.8 13.2h6.4', 'M8.3 15.8h6.4'],
  crop: ['M6.5 2.5v15h15', 'M2.5 6.5h15v15'],
  flatten: ['M12 3.5l9 4.5-9 4.5L3 8z', 'M3 12l9 4.5 9-4.5', 'M3 16l9 4.5 9-4.5'],
  metadata: ['M3 12.3V3.5h8.8l9.2 9.2-8.8 8.8z', 'M7.6 7.6h.01'],
  merge: ['M3.5 3h6v8h-6z', 'M14.5 3h6v8h-6z', 'M6.5 11v2.5c0 1.7 1.3 3 3 3h5c1.7 0 3-1.3 3-3V11', 'M12 16.5v5', 'M9.5 19l2.5 2.5 2.5-2.5'],
  split: ['M3 4h7v16H3z', 'M14 4h7v16h-7z', 'M12 2v2', 'M12 7v2', 'M12 12v2', 'M12 17v2'],
  remove: ['M4 6.5h16', 'M9.5 6.5V4h5v2.5', 'M6 6.5l1 14h10l1-14', 'M10 10.5v6.5', 'M14 10.5v6.5'],
  extract: ['M5 21.5V2.5h9.5L19 7v4', 'M14.5 2.5V7H19', 'M5 21.5h7', 'M14.5 17.5h7', 'M18.5 14.5l3 3-3 3'],
  organize: ['M4 4h6.5v6.5H4z', 'M13.5 4H20v6.5h-6.5z', 'M4 13.5h6.5V20H4z', 'M13.5 13.5H20V20h-6.5z'],
  rotate: ['M20 12a8 8 0 1 1-2.4-5.7', 'M20.2 3.5v4.3h-4.3'],
  compress: ['M4 9h5V4', 'M20 9h-5V4', 'M4 15h5v5', 'M20 15h-5v5'],
  repair: ['M14.5 6.5l3 3 3.8-3.8a5.5 5.5 0 0 1-7.3 7.3l-7 7a2.1 2.1 0 0 1-3-3l7-7a5.5 5.5 0 0 1 7.3-7.3z'],
  ocr: ['M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M15.5 15.5L21 21', 'M7.5 8.5h6', 'M7.5 11h6', 'M7.5 13.5h4'],
  grayscale: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 3v18', 'M12 7h6.5', 'M12 11h8.8', 'M12 15h8.4', 'M12 19h4.8'],
  images_to_pdf: ['M3 5h18v14H3z', 'M3 16l5-5 4 4 3-3 6 6', 'M15.5 9h.01'],
  office_to_pdf: [...DOC, 'M9 11h7', 'M9 14h7', 'M9 17h4.5'],
  pdf_to_images: [...DOC, 'M8.5 18.5l3-3.5 2 2.2 1.5-1.5 2 2.8', 'M10.5 11.5h.01'],
  pdf_to_word: [...DOC, 'M8.5 11.5l1.4 6 2.1-4.5 2.1 4.5 1.4-6'],
  pdf_to_office: ['M3.5 20.5h17', 'M7 20.5V14', 'M12 20.5V8', 'M17 20.5V4'],
  extract_text: ['M5 5.5V4h14v1.5', 'M12 4v16', 'M9 20h6'],
  extract_images: ['M7.5 3h13.5v12H7.5z', 'M3 7.5V21h13.5', 'M7.5 12.5l4-4 4 4 2.5-2.5 3 3'],
  protect: ['M5 11h14v10H5z', 'M8 11V7.5a4 4 0 0 1 8 0V11', 'M12 15v2.5'],
  unlock: ['M5 11h14v10H5z', 'M8 11V7.5a4 4 0 0 1 7.6-1.8', 'M12 15v2.5'],
  redact: [...DOC, 'F:M8.5 10h8v2.2h-8z', 'F:M8.5 14.5h5.5v2.2H8.5z'],
  compare: ['M3.5 4h7v16h-7z', 'M13.5 4h7v16h-7z', 'M6 8.5h2', 'M16 8.5h2', 'M6 12h2', 'M16 12h2', 'M16 15.5h2'],
};
function svgFrom(paths) {
  const body = paths.map((d) => d.startsWith('F:')
    ? `<path d="${d.slice(2)}" fill="currentColor" stroke="none"/>`
    : `<path d="${d}"/>`).join('');
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
const iconSvg = (id) => svgFrom(ICONS[id] || DOC);
