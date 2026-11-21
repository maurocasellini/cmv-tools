/* Bilingual UI (DE/EN). The UI source text is German; when English is selected, a
   MutationObserver translates every displayed text (including dynamic messages).
   User content (file names, PDF text, signatures) is never touched. */
(() => {
  const EN = {
    'So funktioniert’s': 'How it works',
    'PDFs bearbeiten, ohne sie aus der Hand zu geben.': 'Editing PDFs without handing them over.',
    'Viele bekannte PDF-Webseiten laden deine Dateien auf ihre Server. Hier ist das technisch ausgeschlossen: Die Seite darf mit keinem anderen Server sprechen.': 'Many well-known PDF websites upload your files to their servers. Here that is technically impossible: the page may not talk to any other server.',
    'Die PDF-Engine: MuPDF': 'The PDF engine: MuPDF',
    'Herzstück ist MuPDF – eine bewährte PDF-Software, die auch in vielen PDF-Readern und E-Book-Apps steckt. Sie läuft hier direkt in deinem Browser.': 'At its heart is MuPDF – proven PDF software that is also inside many PDF readers and e-book apps. Here it runs right in your browser.',
    'Deine Datei bleibt bei dir': 'Your file stays with you',
    'Verträge, Ausweise, Rechnungen: Die Datei wird nur im Arbeitsspeicher deines Geräts geöffnet, bearbeitet und wieder gespeichert. Es gibt keinen Server, der sie zu sehen bekommt.': 'Contracts, IDs, invoices: the file is only opened, edited and saved again in your device’s memory. There is no server that gets to see it.',
    'Was geladen wird': 'What gets downloaded',
    'Beim ersten Besuch ca. 38 MB für die PDF-Engine, danach ist sie gespeichert und funktioniert sogar offline – zum Beispiel im Flugzeug.': 'On the first visit about 38 MB for the PDF engine; after that it is stored and even works offline – on a plane, for example.',
    // Header, home, footer
    '100 % lokal': '100% local', 'Kein Upload': 'No upload', 'Beenden': 'Quit', 'App beenden': 'Quit app',
    'Werkzeug suchen …': 'Search tools …',
    'Alle Dateien bleiben auf diesem Mac. Nichts wird hochgeladen.': 'All files stay on this Mac. Nothing is uploaded.',
    'Alle Dateien bleiben auf deinem Gerät. Nichts wird hochgeladen.': 'All files stay on your device. Nothing is uploaded.',
    'PDF Toolkit läuft nicht mehr – bitte die App neu öffnen und diese Seite neu laden.': 'PDF Toolkit is no longer running – please reopen the app and reload this page.',
    'Lokaler PDF-Werkzeugkasten': 'Local PDF toolkit', 'PDF-Werkzeugkasten im Browser': 'PDF toolkit in your browser',
    'Bearbeiten · Unterschreiben · Umwandeln': 'Edit · Sign · Convert',
    'Alles, was du mit PDFs machen musst,': 'Everything you need to do with PDFs,',
    'Alles, was du mit PDFs machen musst –': 'Everything you need to do with PDFs –',
    'offline': 'offline', 'ohne Upload': 'without uploading',
    'Zusammenfügen, verkleinern, Seiten entfernen, unterschreiben, „wie gescannt“ ausgeben und vieles mehr – direkt auf deinem Mac, ohne Upload.': 'Merge, compress, remove pages, sign, make it look scanned and much more – right on your Mac, no upload.',
    'Zusammenfügen, verkleinern, Seiten entfernen, unterschreiben, „wie gescannt“ ausgeben und vieles mehr – direkt in deinem Browser.': 'Merge, compress, remove pages, sign, make it look scanned and much more – right in your browser.',
    'So funktioniert’s:': 'How it works:',
    'Die PDF-Engine läuft als WebAssembly in diesem Tab. Deine Dateien werden nur in den Arbeitsspeicher deines Geräts gelesen – die Seite darf technisch keine Daten an einen Server senden. Nach dem ersten Laden funktioniert sie sogar offline.': 'The PDF engine runs as WebAssembly in this tab. Your files are only read into your device’s memory – the page is technically not allowed to send data to any server. After the first load it even works offline.',
    'Dateien verlassen nie diesen Rechner': 'Files never leave this computer', 'Dateien verlassen nie dein Gerät': 'Files never leave your device',
    '29 Werkzeuge in einer Oberfläche': '29 tools in one place', '25 Werkzeuge, ohne Konto, ohne Limit': '25 tools, no account, no limits',
    'Unterschreiben & „wie gescannt“ in einem Schritt': 'Sign & “make it look scanned” in one step',
    'Läuft lokal auf 127.0.0.1 · keine Daten verlassen diesen Mac': 'Runs locally on 127.0.0.1 · no data leaves this Mac',
    'Verarbeitung nur in deinem Browser ·': 'Processing only in your browser ·', 'Quellcode (AGPL-3.0)': 'Source code (AGPL-3.0)',
    'PDF Toolkit ist beendet.': 'PDF Toolkit has been closed.',
    'Du kannst dieses Fenster schliessen. Neu starten: App „PDF Toolkit“ öffnen.': 'You can close this window. To restart, open the “PDF Toolkit” app.',
    'PDF Toolkit beenden? Nicht heruntergeladene Ergebnisse gehen verloren.': 'Quit PDF Toolkit? Results you have not downloaded will be lost.',
    'Öffnen →': 'Open →', 'Zusatzprogramm nötig': 'Add-on required', 'Kein Werkzeug gefunden.': 'No tool found.',
    // Categories
    'Am häufigsten gebraucht': 'Most used', 'Bearbeiten & Unterschreiben': 'Edit & sign', 'Organisieren': 'Organize',
    'Optimieren': 'Optimize', 'In PDF umwandeln': 'Convert to PDF', 'Aus PDF umwandeln': 'Convert from PDF', 'Sicherheit & Prüfen': 'Security & review',
    // Tools
    'Formular ausfüllen': 'Fill in form', 'PDF-Formulare direkt in den Feldern ausfüllen – Text, Häkchen und Auswahllisten.': 'Fill in PDF forms right in their fields – text, check boxes and drop-downs.',
    'Danach fest einbrennen (Felder nicht mehr änderbar)': 'Flatten afterwards (fields can no longer be changed)',
    'Formularfelder werden gelesen …': 'Reading form fields …', 'Dieses PDF hat keine ausfüllbaren Felder.': 'This PDF has no fillable fields.',
    'Mit „PDF bearbeiten“ kannst du trotzdem Text, Häkchen und Datum auf die Seite setzen.': 'With “Edit PDF” you can still place text, check marks and dates on the page.',
    'In „PDF bearbeiten“ öffnen': 'Open in “Edit PDF”',
    'PDF bearbeiten': 'Edit PDF', 'Text, Bilder, Häkchen, Formen, Abdecken und Schwärzen – direkt auf der Seite.': 'Text, images, check marks, shapes, white-out and redaction – right on the page.',
    'PDF unterschreiben': 'Sign PDF', 'Unterschrift zeichnen, tippen oder als Bild einfügen – optional als „Scan“ ausgeben.': 'Draw, type or upload your signature – optionally export it as a “scan”.',
    'Wie gescannt': 'Make it look scanned', 'Lässt das PDF aussehen, als wäre es ausgedruckt und eingescannt worden (leicht schief, Rauschen, Papierton).': 'Makes the PDF look printed and scanned (slightly skewed, noise, paper tone).',
    'Stärke': 'Strength', 'Leicht': 'Light', 'Mittel': 'Medium', 'Stark': 'Strong',
    'Kaum sichtbar, sehr sauber': 'Barely visible, very clean', 'Typischer Bürokopierer': 'Typical office copier', 'Alter Scanner, deutlich schief': 'Old scanner, clearly skewed',
    'Farbe': 'Colour', 'Graustufen': 'Grayscale', 'Schwarz-Weiss': 'Black & white', 'Schwarz-Weiss (Fax-Look)': 'Black & white (fax look)',
    'Auflösung': 'Resolution', '100 dpi (klein)': '100 dpi (small)', '150 dpi (Standard)': '150 dpi (standard)', '300 dpi (gross)': '300 dpi (large)', '300 dpi (Druck)': '300 dpi (print)',
    'Wasserzeichen': 'Watermark', 'Text oder Bild über bzw. hinter den Inhalt legen.': 'Place text or an image over or behind the content.',
    'Art': 'Type', 'Text': 'Text', 'Bild': 'Image', 'Bildbreite (% der Seite)': 'Image width (% of page)', 'Schriftgrösse': 'Font size',
    'Winkel (°)': 'Angle (°)', 'Deckkraft': 'Opacity', 'Anordnung': 'Layout', 'Einmal mittig': 'Once, centred', 'Gekachelt (ganze Seite)': 'Tiled (whole page)',
    'Ebene': 'Layer', 'Über dem Inhalt': 'Above content', 'Hinter dem Inhalt': 'Behind content',
    'Seiten': 'Pages', 'leer = alle, z. B. 1-3, 5, 8-ende': 'empty = all, e.g. 1-3, 5, 8-end',
    'Seitenzahlen': 'Page numbers', 'Seitenzahlen hinzufügen – Position, Format und Startnummer frei wählbar.': 'Add page numbers – choose position, format and start number.',
    'Position': 'Position', 'Unten Mitte': 'Bottom centre', 'Unten rechts': 'Bottom right', 'Unten links': 'Bottom left',
    'Oben Mitte': 'Top centre', 'Oben rechts': 'Top right', 'Oben links': 'Top left', 'Format': 'Format',
    '{n} = Seitenzahl, {total} = Gesamtzahl': '{n} = page number, {total} = total pages', 'Erste Nummer': 'First number', 'Randabstand (mm)': 'Margin (mm)',
    'PDF zuschneiden': 'Crop PDF', 'Ränder abschneiden (in Millimetern).': 'Trim margins (in millimetres).',
    'Oben (mm)': 'Top (mm)', 'Rechts (mm)': 'Right (mm)', 'Unten (mm)': 'Bottom (mm)', 'Links (mm)': 'Left (mm)',
    'PDF verflachen': 'Flatten PDF', 'Formularfelder und Kommentare fest einbrennen, damit nichts mehr verändert werden kann.': 'Burn in form fields and comments so nothing can be changed anymore.',
    'Metadaten': 'Metadata', 'Titel, Autor usw. ändern oder alle Metadaten entfernen.': 'Change title, author etc. or remove all metadata.',
    'Alle Metadaten entfernen': 'Remove all metadata', 'Titel': 'Title', 'Autor': 'Author', 'Betreff': 'Subject', 'Stichwörter': 'Keywords',
    'PDF zusammenfügen': 'Merge PDF', 'Mehrere PDFs (und Bilder) in der gewünschten Reihenfolge zu einem PDF kombinieren. Reihenfolge per Ziehen ändern.': 'Combine several PDFs (and images) into one PDF in the order you want. Drag to reorder.',
    'Lesezeichen pro Datei anlegen': 'Add a bookmark per file',
    'PDF teilen': 'Split PDF', 'Ein PDF in mehrere Dateien aufteilen.': 'Split one PDF into several files.', 'Aufteilen': 'Split',
    'Nach Bereichen': 'By ranges', 'Alle N Seiten': 'Every N pages', 'Jede Seite einzeln': 'Every page separately', 'Bereiche': 'Ranges',
    'Jeder Bereich wird eine eigene Datei.': 'Each range becomes its own file.', '1-3, 4-6, 7-ende': '1-3, 4-6, 7-end', 'Seiten pro Datei': 'Pages per file',
    'Seiten entfernen': 'Remove pages', 'Einzelne Seiten aus dem PDF löschen. Seiten anklicken oder eingeben.': 'Delete individual pages from the PDF. Click pages or type them.',
    'Zu entfernende Seiten': 'Pages to remove', 'z. B. 2, 5-7': 'e.g. 2, 5-7',
    'Seiten extrahieren': 'Extract pages', 'Ausgewählte Seiten in ein neues PDF übernehmen.': 'Copy selected pages into a new PDF.',
    'Zu übernehmende Seiten': 'Pages to extract', 'z. B. 1, 3-4': 'e.g. 1, 3-4', 'Jede Seite als eigene Datei (ZIP)': 'Each page as a separate file (ZIP)',
    'PDF organisieren': 'Organize PDF', 'Seiten per Ziehen sortieren, drehen, duplizieren, löschen oder leere Seiten einfügen. Auch über mehrere PDFs hinweg.': 'Drag to reorder, rotate, duplicate, delete or insert blank pages. Works across several PDFs.',
    'PDF drehen': 'Rotate PDF', 'Alle oder einzelne Seiten drehen.': 'Rotate all or individual pages.', 'Drehung': 'Rotation',
    '90° im Uhrzeigersinn': '90° clockwise', '90° gegen den Uhrzeigersinn': '90° counter-clockwise',
    'PDF komprimieren': 'Compress PDF', 'PDF kleiner machen – z. B. 50 MB auf 5 MB. Zielgrösse eingeben, den Rest erledigt die App.': 'Make PDFs smaller – e.g. 50 MB down to 5 MB. Enter a target size, the app does the rest.',
    'Methode': 'Method', 'Zielgrösse': 'Target size', 'Auf eine bestimmte Grösse in MB bringen': 'Shrink to a specific size in MB',
    'Empfohlen': 'Recommended', 'Gute Qualität, viel kleiner': 'Good quality, much smaller', 'Gering': 'Low',
    'Beste Qualität, etwas kleiner': 'Best quality, slightly smaller', 'Kleinste Datei, sichtbarer Qualitätsverlust': 'Smallest file, visible quality loss',
    'Zielgrösse (MB)': 'Target size (MB)', 'Typisch: 5 MB für E-Mail-Anhänge, 2 MB für Upload-Portale.': 'Typical: 5 MB for email attachments, 2 MB for upload portals.',
    'Notfalls Seiten in Bilder umwandeln, um das Ziel zu erreichen': 'If necessary, turn pages into images to reach the target',
    'In Graustufen umwandeln (noch kleiner)': 'Convert to grayscale (even smaller)',
    'PDF reparieren': 'Repair PDF', 'Beschädigte oder fehlerhafte PDFs neu aufbauen.': 'Rebuild damaged or faulty PDFs.',
    'OCR – Text erkennen': 'OCR – recognise text', 'Gescannte PDFs durchsuchbar und kopierbar machen (unsichtbare Textebene).': 'Make scanned PDFs searchable and copyable (invisible text layer).',
    'Sprache': 'Language', 'Deutsch + Englisch': 'German + English', 'Deutsch': 'German', 'Englisch': 'English', 'Französisch': 'French', 'Italienisch': 'Italian',
    'Nur Seiten ohne vorhandenen Text': 'Only pages without existing text',
    'In Graustufen': 'Grayscale', 'Farbiges PDF in Schwarz-Weiss/Graustufen umwandeln (Seiten werden zu Bildern).': 'Convert a colour PDF to black & white/grayscale (pages become images).',
    'Bilder in PDF': 'Images to PDF', 'JPG, PNG, HEIC & Co. zu einem PDF zusammenfassen.': 'Combine JPG, PNG, HEIC & co. into one PDF.',
    'JPG, PNG, WebP & Co. zu einem PDF zusammenfassen.': 'Combine JPG, PNG, WebP & co. into one PDF.',
    'Seitengrösse': 'Page size', 'Wie das Bild': 'Same as image', 'Ausrichtung': 'Orientation', 'Automatisch': 'Automatic',
    'Hochformat': 'Portrait', 'Querformat': 'Landscape', 'Rand (mm)': 'Margin (mm)',
    'Office in PDF': 'Office to PDF', 'Word, Excel, PowerPoint, OpenDocument, HTML und Text in PDF umwandeln.': 'Convert Word, Excel, PowerPoint, OpenDocument, HTML and text to PDF.',
    'Mehrere Dateien zu einem PDF zusammenfügen': 'Merge several files into one PDF',
    'PDF in Bilder': 'PDF to images', 'Jede Seite als JPG oder PNG speichern.': 'Save every page as JPG or PNG.',
    'PDF in Word': 'PDF to Word', 'PDF in ein bearbeitbares Word-Dokument (.docx) umwandeln.': 'Convert a PDF into an editable Word document (.docx).',
    'PDF in PowerPoint / Excel': 'PDF to PowerPoint / Excel', 'PowerPoint: jede Seite wird eine Folie. Excel/ODT über LibreOffice (experimentell).': 'PowerPoint: every page becomes a slide. Excel/ODT via LibreOffice (experimental).',
    'Ziel': 'Target', 'Excel (.xlsx) – benötigt LibreOffice': 'Excel (.xlsx) – requires LibreOffice', 'OpenDocument Text (.odt) – benötigt LibreOffice': 'OpenDocument Text (.odt) – requires LibreOffice',
    'Text extrahieren': 'Extract text', 'Den gesamten Text als .txt-Datei speichern.': 'Save all text as a .txt file.',
    'Bilder extrahieren': 'Extract images', 'Alle im PDF eingebetteten Bilder in Originalqualität herauslösen.': 'Extract all embedded images in original quality.',
    'PDF schützen': 'Protect PDF', 'Mit Passwort verschlüsseln (AES-256).': 'Encrypt with a password (AES-256).',
    'Passwort': 'Password', 'Passwort wiederholen': 'Repeat password', 'Drucken erlauben': 'Allow printing', 'Kopieren erlauben': 'Allow copying', 'Bearbeiten erlauben': 'Allow editing',
    'PDF entsperren': 'Unlock PDF', 'Passwortschutz und Einschränkungen entfernen (Passwort nötig, falls zum Öffnen verlangt).': 'Remove password protection and restrictions (password needed if required to open).',
    'Passwort (falls bekannt)': 'Password (if known)',
    'Schwärzen': 'Redact', 'Begriffe dauerhaft entfernen – der Text ist danach wirklich weg, nicht nur überdeckt. Freie Bereiche: im Editor „Schwärzen“ verwenden.': 'Permanently remove terms – the text is really gone, not just covered. For free-form areas use “Redact” in the editor.',
    'Begriffe (einer pro Zeile)': 'Terms (one per line)', 'Max Muster\n079 123 45 67': 'John Smith\n+44 20 7946 0958', 'Max Muster': 'John Smith',
    'Alle E-Mail-Adressen': 'All email addresses', 'Alle IBANs': 'All IBANs', 'Alle Telefonnummern': 'All phone numbers',
    'PDFs vergleichen': 'Compare PDFs', 'Zwei Versionen nebeneinander vergleichen – Unterschiede im Text werden hervorgehoben.': 'Compare two versions side by side – text differences are highlighted.',
    'VERTRAULICH': 'CONFIDENTIAL', 'Seite {n} von {total}': 'Page {n} of {total}',
    'Benötigt Tesseract. Einmalig im Terminal:': 'Requires Tesseract. Run once in Terminal:', ', danach die App neu starten.': ', then restart the app.',
    'Benötigt das kostenlose LibreOffice:': 'Requires the free LibreOffice:', 'oder libreoffice.org.': 'or libreoffice.org.',
    'Python-Modul pdf2docx fehlt – start.command erneut ausführen.': 'Python module pdf2docx is missing – run start.command again.',
    // Tool view
    '← Alle Werkzeuge': '← All tools', 'Dateien hierher ziehen': 'Drop files here', 'oder': 'or', 'auswählen': 'browse',
    'Mehrere Dateien möglich': 'Multiple files allowed', 'Eine Datei': 'One file', 'Seiten anklicken zum Auswählen': 'Click pages to select them',
    'alle': 'all', 'keine': 'none', 'umkehren': 'invert', '·': '·',
    '+ Leere Seite': '+ Blank page', '⟳ Alle drehen': '⟳ Rotate all', '⇅ Reihenfolge umkehren': '⇅ Reverse order', 'Zurücksetzen': 'Reset',
    'Ausführen': 'Run', 'Vergleichen': 'Compare', 'PDF erstellen': 'Create PDF', 'Dateien werden geladen …': 'Loading files …',
    'Passwortgeschützt – zuerst entsperren': 'Password-protected – unlock it first', 'Ziehen zum Sortieren': 'Drag to reorder',
    'Entfernen': 'Remove', 'A→Z sortieren': 'Sort A→Z', 'Umkehren': 'Reverse', 'Leere Seite': 'Blank page', 'leer': 'blank',
    'Links drehen': 'Rotate left', 'Rechts drehen': 'Rotate right', 'Duplizieren': 'Duplicate', 'Löschen': 'Delete',
    'Bitte zuerst eine Datei hinzufügen.': 'Please add a file first.', 'Fertig!': 'Done!', 'Weiterverarbeiten mit …': 'Continue with …',
    'Vorschau öffnen': 'Open preview', 'Herunterladen': 'Download', 'Kein Unterschied im Text gefunden': 'No text differences found',
    'Wird verarbeitet …': 'Processing …', 'Upload fehlgeschlagen': 'Upload failed', 'Server antwortet nicht.': 'Server not responding.', 'Fehler': 'Error',
    // Editor
    'Auswählen': 'Select', 'Unterschrift': 'Signature', 'Datum': 'Date', 'Abdecken': 'White-out', 'Markieren': 'Highlight',
    'Auswählen & verschieben (V)': 'Select & move (V)', 'Unterschrift hinzufügen': 'Add signature', 'Text (T)': 'Text (T)', 'Heutiges Datum': 'Today’s date',
    'Bild einfügen': 'Insert image', 'Häkchen': 'Check mark', 'Kreuz': 'Cross', 'Weiss abdecken (Text überdecken)': 'White-out (cover text)',
    'Rechteck': 'Rectangle', 'Ellipse': 'Ellipse', 'Linie': 'Line', 'Bereich dauerhaft schwärzen': 'Permanently redact area',
    'Rückgängig (⌘Z)': 'Undo (⌘Z)', 'Verkleinern': 'Zoom out', 'Vergrössern': 'Zoom in',
    'PDF hierher ziehen': 'Drop a PDF here', 'Wähle oben ein Werkzeug und klicke auf die Seite.': 'Pick a tool above and click on the page.',
    'Fertigstellen': 'Finish', 'Als Scan ausgeben': 'Export as scan', 'Sieht aus wie ausgedruckt, unterschrieben & eingescannt': 'Looks printed, signed & scanned',
    'PDF speichern': 'Save PDF', 'PDF wird geladen …': 'Loading PDF …',
    'Dieses PDF ist passwortgeschützt – bitte zuerst „PDF entsperren“ verwenden.': 'This PDF is password-protected – please use “Unlock PDF” first.',
    'Das ist kein lesbares PDF.': 'This is not a readable PDF.', 'Andere PDF öffnen': 'Open another PDF',
    'Elemente anklicken, ziehen zum Verschieben, Ecke ziehen für Grösse. Doppelklick auf Text zum Bearbeiten.': 'Click elements, drag to move, drag the corner to resize. Double-click text to edit.',
    'Klicke auf die Seite, wo der Text stehen soll.': 'Click where the text should go.',
    'Klicke auf die Stelle, die weiss überdeckt werden soll – danach Grösse anpassen.': 'Click the spot to white out – then adjust the size.',
    'Bereich wird beim Speichern dauerhaft entfernt (inkl. Text darunter).': 'The area is permanently removed when saving (including the text underneath).',
    'Klicke auf die Seite, um das Element zu platzieren.': 'Click on the page to place the element.',
    'SCHWÄRZEN': 'REDACT', 'Abdeckung': 'White-out', 'Markierung': 'Highlight', 'Schwärzung': 'Redaction', 'Schrift': 'Font',
    'Grösse (pt)': 'Size (pt)', 'F': 'B', 'K': 'I', 'Text bearbeiten': 'Edit text', 'Ecke ziehen = proportional, mit ⇧ frei.': 'Drag corner = proportional, hold ⇧ for free.',
    'Linienstärke': 'Line width', 'Füllung': 'Fill', 'Inhalt unter diesem Bereich wird beim Speichern unwiderruflich entfernt.': 'Content under this area will be irreversibly removed when saving.',
    'z. B. für Initialen/Paraphe auf jeder Seite': 'e.g. for initials on every page', '⧉ Duplizieren': '⧉ Duplicate', '⇊ Auf allen Seiten': '⇊ On all pages', '🗑 Löschen': '🗑 Delete',
    'Bitte zuerst ein PDF öffnen.': 'Please open a PDF first.', 'Noch nichts eingefügt.': 'Nothing added yet.',
    'Wird gespeichert & „eingescannt“ …': 'Saving & “scanning” …', 'Wird gespeichert …': 'Saving …', 'Text eingeben': 'Enter text',
    // Signature
    'Zeichnen': 'Draw', 'Tippen': 'Type', 'Bild hochladen': 'Upload image', 'Stift': 'Pen', 'Weissen Hintergrund entfernen': 'Remove white background',
    'Für nächstes Mal speichern (nur in diesem Browser)': 'Save for next time (only in this browser)', 'Abbrechen': 'Cancel', 'Einfügen': 'Insert',
    'Dein Name': 'Your name', 'Bitte zuerst das PDF öffnen, das unterschrieben werden soll.': 'Please open the PDF you want to sign first.',
    'Gespeicherte Unterschriften – anklicken zum Einfügen:': 'Saved signatures – click to insert:', 'Bitte zuerst unterschreiben.': 'Please sign first.',
    'Bitte Namen eingeben.': 'Please enter a name.', 'Bitte ein Bild wählen.': 'Please choose an image.', 'Die Unterschrift ist leer.': 'The signature is empty.',
    // Web version
    'PDF-Engine wird geladen …': 'Loading PDF engine …', 'PDF-Bibliotheken werden geladen …': 'Loading PDF libraries …',
    'Dieser Browser wird nicht unterstützt. Bitte eine aktuelle Version von Safari, Chrome, Edge oder Firefox verwenden.': 'This browser is not supported. Please use a current version of Safari, Chrome, Edge or Firefox.',
    'PDF Toolkit ist in keinem Tab geöffnet.': 'PDF Toolkit is not open in any tab.', 'Datei nicht gefunden': 'File not found', 'Unbekannte Anfrage': 'Unknown request',
    'Dieses Werkzeug ist in der Web-Version nicht verfügbar.': 'This tool is not available in the web version.',
    'Zu wenig Arbeitsspeicher im Browser für diese Datei.': 'Not enough browser memory for this file.',
    // Datenschutz / Impressum
    'Verarbeitung nur in deinem Browser · AGPL-3.0': 'Processing only in your browser · AGPL-3.0',
    'Alle Tools': 'All tools', 'CM Ventures – Startseite': 'CM Ventures – home page', 'Quellcode': 'Source code', 'Open-Source-Lizenzen': 'Open-source licenses', 'CM Ventures – alle Tools': 'CM Ventures – all tools', 'Datenschutz': 'Privacy', 'Impressum': 'Legal notice', 'Hinweise zum Tool': 'About this tool', 'Datenschutzerklärung': 'Privacy policy', 'Hosting': 'Hosting', 'Verantwortlich': 'Controller',
    'Speicherung auf deinem Gerät': 'Storage on your device',
    'PDF Toolkit verarbeitet deine Dateien ausschliesslich in deinem Browser. Dateien, Inhalte und Eingaben werden nicht an einen Server übertragen – die Seite darf technisch keine Verbindungen zu fremden Servern aufbauen.': 'PDF Toolkit processes your files exclusively in your browser. Files, content and input are never transferred to a server – the page is technically not allowed to connect to any third-party server.',
    'Die Website wird über Vercel Inc. (USA) ausgeliefert. Beim Aufruf verarbeitet Vercel technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt, Browsertyp), um die Seite auszuliefern und vor Missbrauch zu schützen.': 'The website is delivered via Vercel Inc. (USA). When you visit it, Vercel processes technically necessary connection data (e.g. IP address, time, browser type) to deliver the page and protect it against abuse.',
    'Damit die App schnell startet und offline funktioniert, speichert dein Browser ihre Programmdateien. Zusätzlich werden nur deine Sprachwahl und – falls du das möchtest – gespeicherte Unterschriften lokal abgelegt. Diese Daten bleiben auf deinem Gerät und lassen sich jederzeit über die Browser-Einstellungen löschen.': 'So that the app starts quickly and works offline, your browser stores its program files. Apart from that, only your language choice and – if you want – saved signatures are stored locally. This data stays on your device and can be deleted at any time in your browser settings.',
    'Es gibt keine Cookies, kein Tracking und keine Analyse-Werkzeuge.': 'There are no cookies, no tracking and no analytics tools.',
    'Verantwortlich ist der Betreiber gemäss Impressum auf cmventures.xyz. Es gilt die allgemeine Datenschutzerklärung von cmventures.xyz; bei Fragen wende dich an die dort genannte Kontaktadresse.': 'The controller is the operator named in the legal notice on cmventures.xyz. The general privacy policy of cmventures.xyz applies; for questions, please use the contact details given there.',
    // PDF engine messages
    'Bitte mindestens zwei Dateien auswählen.': 'Please select at least two files.', 'Es können nicht alle Seiten entfernt werden.': 'You cannot remove all pages.',
    'Keine Seiten übrig.': 'No pages left.', 'Bitte Seiten angeben (z. B. 1-3, 5).': 'Please specify pages (e.g. 1-3, 5).',
    'Die Datei ist bereits optimal komprimiert – keine weitere Verkleinerung möglich.': 'This file is already optimally compressed – it cannot be made any smaller.',
    'Im PDF wurden keine eingebetteten Bilder gefunden.': 'No embedded images were found in the PDF.', 'Die Ränder sind zu gross für die Seitengrösse.': 'The margins are too large for the page size.',
    'Bitte ein Passwort eingeben.': 'Please enter a password.', 'Die Passwörter stimmen nicht überein.': 'The passwords do not match.',
    'AES-256 verschlüsselt': 'Encrypted with AES-256', 'Schutz entfernt': 'Protection removed', 'Falsches Passwort.': 'Wrong password.',
    'Bitte Begriffe oder Muster zum Schwärzen angeben.': 'Please enter terms or patterns to redact.', 'Keine Treffer gefunden – nichts geschwärzt.': 'No matches found – nothing redacted.',
    'Formulare & Kommentare fest eingebrannt': 'Forms & comments flattened', 'Alle Metadaten entfernt': 'All metadata removed', 'Metadaten aktualisiert': 'Metadata updated',
    'Bitte genau zwei PDFs zum Vergleichen auswählen.': 'Please select exactly two PDFs to compare.', '1 Datei erstellt': '1 file created',
    'PDF neu aufgebaut': 'PDF rebuilt', 'PDF neu aufgebaut (Fehler wurden behoben)': 'PDF rebuilt (errors were fixed)', 'Konvertierung fehlgeschlagen.': 'Conversion failed.',
    'Tesseract ist nicht installiert. Im Terminal: brew install tesseract tesseract-lang': 'Tesseract is not installed. In Terminal: brew install tesseract tesseract-lang',
  };

  // Texts with numbers/names: rules applied to the whole text
  const RULES = [
    [/^(\d+) Felder? zum Ausfüllen – direkt in die Seite tippen\.$/, (m, n) => `${n} field${n === '1' ? '' : 's'} to fill in – type straight into the page.`],
    [/^(\d+) Felder ausgefüllt und fest eingebrannt$/, '$1 fields filled in and flattened'],
    [/^(\d+) Felder ausgefüllt$/, '$1 fields filled in'],
    [/^(\d+) Unterschied\(e\) gefunden$/, '$1 difference(s) found'],
    [/^· Übereinstimmung ([\d.]+) %$/, '· $1% match'],
    [/^… (\d+) gleiche Zeilen …$/, '… $1 identical lines …'],
    [/^Seite (\d+) von (\d+)$/, 'Page $1 of $2'],
    [/^Seite (\d+)$/, 'Page $1'],
    [/^Auf (\d+) weitere Seite\(n\) kopiert\.$/, 'Copied to $1 more page(s).'],
    [/^Gespeichert: (.+)$/, 'Saved: $1'],
    [/^(\d+) Dateien → (\d+) Seiten$/, '$1 files → $2 pages'],
    [/^(\d+) PDFs im ZIP$/, '$1 PDFs in a ZIP'],
    [/^(\d+) Seite\(n\) entfernt, (\d+) verbleiben$/, '$1 page(s) removed, $2 remaining'],
    [/^(\d+) einzelne PDFs$/, '$1 separate PDFs'],
    [/^(\d+) Seite\(n\) extrahiert$/, '$1 page(s) extracted'],
    [/^(\d+) Seite\(n\) um (\d+)° gedreht$/, '$1 page(s) rotated by $2°'],
    [/^(\d+) Seite\(n\) „gescannt“$/, '$1 page(s) “scanned”'],
    [/^(\d+) Bild\(er\) → PDF$/, '$1 image(s) → PDF'],
    [/^(\d+) Bilder$/, '$1 images'],
    [/^(\d+) Stelle\(n\) dauerhaft geschwärzt$/, '$1 occurrence(s) permanently redacted'],
    [/^Texterkennung auf (\d+) Seite\(n\)$/, 'Text recognised on $1 page(s)'],
    [/^(\d+) Element\(e\) eingefügt$/, '$1 element(s) added'],
    [/^(\d+) Dateien in ein PDF$/, '$1 files merged into one PDF'],
    [/^(\d+) PDFs$/, '$1 PDFs'],
    [/^Ungültige Seitenangabe: „(.+)“$/, 'Invalid page range: “$1”'],
    [/^Keine gültigen Seiten \(Dokument hat (\d+) Seiten\)\.$/, 'No valid pages (document has $1 pages).'],
    [/^„(.+)“ ist passwortgeschützt\. Bitte zuerst mit „PDF entsperren“ öffnen\.$/, '“$1” is password-protected. Please open it with “Unlock PDF” first.'],
    [/^„(.+)“ ist kein lesbares PDF \((.*)\)\.$/, '“$1” is not a readable PDF ($2).'],
    [/^Unerwarteter Fehler: (.*)$/, 'Unexpected error: $1'],
    [/^Fehler in der PDF-Engine: (.*)$/, 'Error in the PDF engine: $1'],
    [/^Die PDF-Engine konnte nicht geladen werden: (.*)$/, 'The PDF engine could not be loaded: $1'],
    [/^Start fehlgeschlagen \(Service Worker\): (.*)$/, 'Start failed (service worker): $1'],
    // Fragments (global, inside composite texts)
    [/(\d+) Seiten\b/g, (m, n) => `${n} page${n === '1' ? '' : 's'}`],
    [/(\d+) Seite\b/g, '$1 page'],
    [/ gespart\b/g, ' saved'],
    [/\((\d+) % kleiner\)/g, '($1% smaller)'],
    [/ · Bilder auf (\d+) dpi/g, ' · images at $1 dpi'],
    [/ · Seiten als Bild mit (\d+) dpi/g, ' · pages as images at $1 dpi'],
    [/ · Ziel (.+?) nicht ganz erreicht – kleiner geht es ohne unlesbare Qualität nicht/g, ' · target $1 not quite reached – any smaller would make it unreadable'],
  ];

  const KEY = 'pdfw-lang';
  let lang;
  try { lang = localStorage.getItem(KEY); } catch { /* private mode */ }
  if (lang !== 'de' && lang !== 'en') lang = (navigator.language || 'de').toLowerCase().startsWith('de') ? 'de' : 'en';

  function toEN(s) {
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const core = m[2];
    if (!core) return s;
    let r = EN[core];
    if (r === undefined) {
      r = core;
      for (const [re, rep] of RULES) r = r.replace(re, rep);
    }
    return m[1] + r + m[3];
  }
  const tr = (s) => (lang === 'en' ? toEN(s) : s);

  // Never translate user content
  const SKIP = '[data-no-i18n], .ed-overlay, .sig-font, .sig-saved img, .cmp-c, .cmp-h, .res-name, .file-meta strong, script, style, code';
  const ORIG = new WeakMap();
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const AORIG = new WeakMap();

  function doText(n) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) return;
    const cur = n.nodeValue;
    let o = ORIG.get(n);
    if (o === undefined || (cur !== o && cur !== toEN(o))) { o = cur; ORIG.set(n, o); }
    const want = tr(o);
    if (cur !== want) n.nodeValue = want;
  }
  function doAttrs(el) {
    if (el.closest('.ed-overlay, [data-no-i18n]')) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a);
      const map = AORIG.get(el) || {};
      let o = map[a];
      if (o === undefined || (cur !== o && cur !== toEN(o))) { o = cur; map[a] = o; AORIG.set(el, map); }
      const want = tr(o);
      if (cur !== want) el.setAttribute(a, want);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) (n.nodeType === 3 ? doText(n) : doAttrs(n));
  }
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
    obs.takeRecords();
  });

  function renderSwitch() {
    document.documentElement.lang = lang;
    document.title = tr('PDF Toolkit');
    document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  }
  function setLang(l) {
    lang = l === 'en' ? 'en' : 'de';
    try { localStorage.setItem(KEY, lang); } catch { /* private mode */ }
    walk(document.body);
    obs.takeRecords();
    renderSwitch();
    document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }

  window.i18n = tr;
  window.I18N = { get lang() { return lang; }, set: setLang };

  function start() {
    walk(document.body);
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    renderSwitch();
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (b) setLang(b.dataset.lang);
    });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
