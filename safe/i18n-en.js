/* English texts of File Safe (source texts are German). */
window.I18N_EN = {
  'So funktioniert’s': 'How it works',
  'Ein Schloss, für das nur du den Schlüssel hast.': 'A lock only you have the key to.',
  'Verschlüsselt wird bei dir': 'Encryption happens on your device',
  'Dein Browser verschliesst die Datei mit AES-256 – demselben Verfahren, das Banken und Behörden verwenden. Die Verschlüsselung ist im Browser eingebaut, es wird nichts zusätzlich geladen.':
    'Your browser locks the file with AES-256 – the same method banks and governments use. Encryption is built into the browser; nothing extra is downloaded.',
  'Das Passwort ist der Schlüssel': 'The password is the key',
  'Aus deinem Passwort wird der Schlüssel berechnet – absichtlich langsam, damit niemand Millionen Passwörter durchprobieren kann. Das Passwort wird nirgends gespeichert. Vergisst du es, kann auch niemand sonst die Datei öffnen.':
    'The key is calculated from your password – deliberately slowly, so nobody can try millions of passwords. The password is not stored anywhere. If you forget it, nobody else can open the file either.',
  'Verschicken, wie du willst': 'Send it any way you like',
  'Die verschlüsselte Datei kannst du per E-Mail, WhatsApp oder Cloud teilen – wer sie abfängt, sieht nur Zahlensalat. Der Empfänger öffnet sie auf dieser Seite mit dem Passwort, auch offline.':
    'Share the encrypted file by email, WhatsApp or cloud – anyone intercepting it only sees gibberish. The recipient opens it on this page with the password, even offline.',
  'Anders als bei Download-Links von WeTransfer & Co. liegt deine Datei nie auf einem fremden Server – und sie bleibt geschützt, egal wo sie später landet.':
    'Unlike download links from WeTransfer & co., your file never sits on someone else’s server – and it stays protected wherever it ends up later.',
  'File Safe': 'File Safe', 'Datei-Safe': 'File safe',
  'Alle Dateien bleiben auf deinem Gerät. Nichts wird hochgeladen.': 'All files stay on your device. Nothing is uploaded.',
  'Verschlüsselt verschicken,': 'Send it encrypted,', 'nur mit Passwort lesbar': 'readable only with the password',
  'Verträge, Ausweise, Gehaltsabrechnungen: Datei oder Nachricht hier mit einem Passwort verschliessen und dann ganz normal per E-Mail, WhatsApp oder USB-Stick weitergeben. Ohne das Passwort ist der Inhalt wertlos.':
    'Contracts, IDs, payslips: lock a file or message here with a password, then pass it on as usual by email, WhatsApp or USB stick. Without the password the content is worthless.',
  'Verschlüsseln': 'Encrypt', 'Entschlüsseln': 'Decrypt', 'Datei': 'File', 'Nachricht': 'Message',
  'Dateien hierher ziehen': 'Drop files here', 'oder': 'or', 'auswählen': 'choose', '– mehrere werden zu einem ZIP': '– several become one ZIP',
  'z. B. Zugangsdaten, IBAN, private Notiz …': 'e.g. login details, IBAN, private note …',
  'Passwort': 'Password', 'Zeigen': 'Show', 'Verbergen': 'Hide', 'Erzeugen': 'Generate',
  'Passwort anzeigen': 'Show password', 'Sicheres Passwort erzeugen': 'Generate a strong password',
  'Mindestens 10 Zeichen – oder „Erzeugen“ verwenden.': 'At least 10 characters – or use “Generate”.',
  'Zu kurz – mindestens 10 Zeichen.': 'Too short – at least 10 characters.', 'Schwach – leicht zu erraten.': 'Weak – easy to guess.',
  'Mittel – besser länger machen.': 'Medium – better make it longer.', 'Stark.': 'Strong.',
  'Verschlüsselt': 'Encrypted', 'Entschlüsselt': 'Decrypted', 'Teilen': 'Share', 'Teilen / Sichern': 'Share / Save', 'Herunterladen': 'Download',
  'Text kopieren': 'Copy text', 'So bleibt es sicher:': 'Keep it safe:',
  'Datei bzw. Text auf dem einen Weg schicken (z. B. E-Mail), das Passwort auf einem anderen (Anruf, SMS, persönlich).':
    'Send the file or text one way (e.g. email) and the password another way (call, text message, in person).',
  'Anleitung für den Empfänger kopieren': 'Copy instructions for the recipient',
  'Verschlüsselte Datei hierher ziehen': 'Drop the encrypted file here', '(.cmvsafe)': '(.cmvsafe)',
  '… oder verschlüsselten Text einfügen': '… or paste encrypted text',
  'AES-256-GCM, Schlüssel per PBKDF2 (600 000 Runden)': 'AES-256-GCM, key via PBKDF2 (600,000 rounds)',
  'Dateien jeder Art, auch mehrere auf einmal': 'Any kind of file, several at once',
  'Kein Konto, kein Server, kein Link, der abläuft': 'No account, no server, no link that expires',
  'Hinweise zum Tool': 'About this tool', '← Zurück': '← Back', 'Verfahren': 'Method', 'Grenzen': 'Limits',
  'File Safe läuft vollständig in deinem Browser. Dateien, Nachrichten und Passwörter werden nur im Arbeitsspeicher deines Geräts verarbeitet und nie an einen Server gesendet – die Seite darf technisch keine Verbindung zu anderen Servern aufbauen (Content Security Policy).':
    'File Safe runs entirely in your browser. Files, messages and passwords are only processed in your device’s memory and never sent to a server – the page is technically not allowed to connect to other servers (Content Security Policy).',
  'AES-256-GCM in Blöcken zu 4 MB; jeder Block ist einzeln geprüft, Reihenfolge und Vollständigkeit sind abgesichert. Der Schlüssel wird mit PBKDF2-SHA-256 (600 000 Runden, zufälliges Salz) aus dem Passwort abgeleitet. Verwendet wird ausschliesslich die Web Crypto API des Browsers. Auch Dateiname und Dateityp sind verschlüsselt.':
    'AES-256-GCM in 4 MB blocks; every block is authenticated, and order and completeness are protected. The key is derived from the password with PBKDF2-SHA-256 (600,000 rounds, random salt). Only the browser’s Web Crypto API is used. File name and type are encrypted too.',
  'Die Sicherheit hängt am Passwort: Kurze oder erratbare Passwörter lassen sich durchprobieren. Am sichersten ist ein erzeugtes Passwort. Sehr grosse Dateien (über ca. 1–2 GB) können den Speicher des Browsers übersteigen.':
    'Security depends on the password: short or guessable passwords can be brute-forced. A generated password is the safest. Very large files (over about 1–2 GB) can exceed the browser’s memory.',
  'Falsches Passwort – oder die Datei wurde verändert.': 'Wrong password – or the file was modified.',
  'Die Datei ist beschädigt oder unvollständig.': 'The file is damaged or incomplete.',
  'Das ist keine mit File Safe verschlüsselte Datei.': 'This is not a file encrypted with File Safe.',
  'Diese Datei stammt aus einer neueren Version von File Safe.': 'This file comes from a newer version of File Safe.',
  'Bitte ein Passwort mit mindestens 10 Zeichen wählen – oder „Erzeugen“.': 'Please choose a password with at least 10 characters – or “Generate”.',
  'Bitte zuerst eine Nachricht eingeben.': 'Please enter a message first.', 'Bitte zuerst eine Datei wählen.': 'Please choose a file first.',
  'Bitte zuerst eine verschlüsselte Datei wählen oder Text einfügen.': 'Please choose an encrypted file or paste text first.',
  'Bitte das Passwort eingeben.': 'Please enter the password.',
  'ZIP wird erstellt …': 'Creating ZIP …', 'Wird verschlüsselt …': 'Encrypting …', 'Wird entschlüsselt …': 'Decrypting …',
  'Dateien': 'Files', 'Kopiert.': 'Copied.', 'Kopieren nicht möglich – bitte von Hand markieren.': 'Copying not possible – please select it by hand.',
  'Ich habe dir etwas verschlüsselt geschickt. So öffnest du es: {url} aufrufen → „Entschlüsseln“ → Datei wählen oder Text einfügen → Passwort eingeben. Das Passwort bekommst du separat von mir.':
    'I sent you something encrypted. To open it: go to {url} → “Decrypt” → choose the file or paste the text → enter the password. I’ll send you the password separately.',
  'Entfernen': 'Remove',
};
window.I18N_RULES = [
  [/^Verschlüsseln fehlgeschlagen: /, 'Encryption failed: '],
  [/ · (\d+) Dateien · /, ' · $1 files · '],
];
