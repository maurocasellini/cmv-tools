/* English texts of QR Codes (source texts are German). */
window.I18N_EN = {
    'So funktioniert’s': 'How it works',
    'Ein QR-Code ohne Haken.': 'A QR code with no strings attached.',
    'Tipp: Vor dem Drucken einmal mit dem Handy scannen – besonders mit Logo oder hellen Farben.': 'Tip: scan it once with your phone before printing – especially with a logo or light colors.',
    'Nur dein Inhalt': 'Only your content',
    'Der Code enthält genau das, was du eingibst – deinen Link, dein WLAN, deine Kontaktdaten. Kein Umweg über fremde Kurzlinks.': 'The code contains exactly what you enter – your link, your Wi-Fi, your contact details. No detour via someone else’s short links.',
    'Funktioniert für immer': 'Works forever',
    'Viele QR-Dienste zählen Scans über eigene Weiterleitungen – endet das Abo, ist der gedruckte Code tot. Dieser Code braucht keinen Dienst und funktioniert, solange es QR-Codes gibt.': 'Many QR services count scans via their own redirects – when the subscription ends, the printed code is dead. This code needs no service and works as long as QR codes exist.',
    'Ein kleines Open-Source-Programm': 'A small open-source program',
    'Den Code berechnet ein frei verfügbares Programm (qrcode-generator von Kazuhiko Arase) direkt in deinem Browser. WLAN-Passwörter und Kontaktdaten verlassen dein Gerät nie.': 'The code is calculated by a freely available program (qrcode-generator by Kazuhiko Arase) right in your browser. Wi-Fi passwords and contact details never leave your device.',
  'QR Codes': 'QR Codes', 'QR-Codes': 'QR codes', 'QR-Codes im': 'QR codes with', 'eigenen Look': 'your own look',
  'Für Links, WLAN-Zugang, Visitenkarten und mehr – mit deinen Farben und deinem Logo. Ohne Konto, ohne Tracking-Weiterleitung: Der Code enthält genau deinen Inhalt.':
    'For links, Wi-Fi access, business cards and more – in your colors, with your logo. No account, no tracking redirect: the code contains exactly your content.',
  'Alle Daten bleiben auf deinem Gerät. Nichts wird hochgeladen.': 'All data stays on your device. Nothing is uploaded.',
  'Link': 'Link', 'WLAN': 'Wi-Fi', 'Kontakt': 'Contact', 'E-Mail': 'Email', 'Telefon': 'Phone', 'Text': 'Text',
  'Adresse (URL)': 'Address (URL)', 'Netzwerkname (SSID)': 'Network name (SSID)', 'Passwort': 'Password', 'Verschlüsselung': 'Encryption',
  'Keine': 'None', 'Verstecktes Netzwerk': 'Hidden network',
  'Beim Scannen verbindet sich das Handy direkt mit dem WLAN – praktisch für Gäste.': 'Scanning connects the phone directly to the Wi-Fi – handy for guests.',
  'Vorname': 'First name', 'Nachname': 'Last name', 'Firma': 'Company', 'Funktion': 'Job title', 'Website': 'Website', 'Adresse': 'Address',
  'Strasse, PLZ Ort, Land': 'Street, postcode city, country', 'E-Mail-Adresse': 'Email address', 'Betreff': 'Subject', 'Nachricht': 'Message',
  'Telefonnummer': 'Phone number', 'Design': 'Design', 'Farbe': 'Color', 'Hintergrund': 'Background', 'Transparenter Hintergrund': 'Transparent background',
  'Punkte': 'Dots', 'Quadrat': 'Square', 'Abgerundet': 'Rounded', 'Ecken': 'Corners', 'Eckig': 'Square', 'Rund': 'Round', 'Akzentfarbe': 'Accent color',
  'Logo in der Mitte': 'Logo in the center', 'Bild wählen': 'Choose image', 'Entfernen': 'Remove', 'Fehlerkorrektur': 'Error correction',
  'Mittel (15 %)': 'Medium (15%)', 'Hoch (25 %)': 'High (25%)', 'Sehr hoch (30 %) – für Logos': 'Very high (30%) – for logos', 'Niedrig (7 %) – kleinster Code': 'Low (7%) – smallest code',
  'Teilen': 'Share', 'Tipp: Vor dem Drucken einmal mit dem Handy testen – vor allem mit Logo oder hellen Farben.': 'Tip: test with your phone before printing – especially with a logo or light colors.',
  'Inhalt eingeben – der QR-Code erscheint hier.': 'Enter content – the QR code appears here.', 'Zu viel Inhalt für einen QR-Code – bitte kürzen.': 'Too much content for a QR code – please shorten it.',
  'Version': 'Version', 'Module': 'modules', 'Bytes': 'bytes', 'Dieses Bild kann nicht verwendet werden.': 'This image cannot be used.',
  'Die QR-Codes werden direkt in deinem Browser erzeugt. Eingaben wie WLAN-Passwörter oder Kontaktdaten verlassen dein Gerät nie – die Seite darf technisch keine Verbindung zu anderen Servern aufbauen (Content Security Policy).':
    'The QR codes are created right in your browser. Entries such as Wi-Fi passwords or contact details never leave your device – the page is technically not allowed to connect to other servers (Content Security Policy).',
  'Keine Weiterleitung': 'No redirect',
  'Viele QR-Dienste leiten über eigene Kurzlinks, um Scans zu zählen – und der Code funktioniert nicht mehr, wenn das Abo endet. Hier enthält der Code genau deinen Inhalt und funktioniert für immer.':
    'Many QR services route through their own short links to count scans – and the code stops working when the subscription ends. Here the code contains exactly your content and works forever.',
  'Open Source': 'Open source',
  'QR-Code-Erzeugung: qrcode-generator von Kazuhiko Arase (MIT). „QR Code“ ist eine eingetragene Marke der DENSO WAVE INCORPORATED.':
    'QR code generation: qrcode-generator by Kazuhiko Arase (MIT). “QR Code” is a registered trademark of DENSO WAVE INCORPORATED.',
};
window.I18N_RULES = [
  [/^Version (\d+) · (\d+)×(\d+) Module · Fehlerkorrektur (\w) · (\d+) Bytes$/, 'Version $1 · $2×$3 modules · error correction $4 · $5 bytes'],
];
