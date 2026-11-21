/* English texts of the Translator (source texts are German). */
window.I18N_EN = {
    'So funktioniert’s': 'How it works',
    'Warum hier niemand mitliest.': 'Why nobody reads along here.',
    'Ehrlich gesagt: Die Modelle sind klein und schnell, aber nicht ganz so gut wie grosse Cloud-Dienste. Für Verträge oder Wichtiges bitte gegenlesen – dafür bleiben vertrauliche Inhalte wirklich vertraulich.': 'To be honest: the models are small and fast, but not quite as good as large cloud services. Please proofread contracts or important texts – in return, confidential content really stays confidential.',
    'Die Modelle stammen von Mozilla': 'The models come from Mozilla',
    'Mozilla – die Organisation hinter dem Firefox-Browser – hat für Firefox eine Übersetzung entwickelt, die ohne Cloud funktioniert. Genau diese Sprachmodelle verwenden wir.': 'Mozilla – the organization behind the Firefox browser – built a translation feature for Firefox that works without a cloud. We use exactly these language models.',
    'Übersetzt wird auf deinem Gerät': 'Translation happens on your device',
    'Pro Sprachrichtung (z. B. Deutsch → Englisch) lädt dein Browser einmal ein kleines Modell von ca. 23 MB. Danach übersetzt dein Gerät selbst – auch ohne Internet.': 'For each language direction (e.g. German → English) your browser downloads a small model of about 23 MB once. After that your device translates on its own – even without internet.',
    'Kein Dienst sieht deinen Text': 'No service sees your text',
    'Bei Google Translate oder DeepL geht jeder Text an deren Server. Hier wird nichts gesendet – die Seite darf technisch gar nicht mit anderen Servern sprechen.': 'With Google Translate or DeepL, every text goes to their servers. Here nothing is sent – the page is technically not allowed to talk to other servers.',
  'Translator': 'Translator', 'Übersetzer': 'Translator', 'Übersetzen,': 'Translate', 'ohne mitzulesen': 'without anyone reading along',
  'Vertrauliche Texte, E-Mails oder Untertitel übersetzen – die Übersetzungs-KI von Mozilla läuft direkt in deinem Browser. Kein Text geht an Google, DeepL oder sonst einen Dienst.':
    'Translate confidential texts, emails or subtitles – Mozilla’s translation AI runs right in your browser. No text goes to Google, DeepL or any other service.',
  'Ausgangssprache': 'Source language', 'Zielsprache': 'Target language', 'Sprachen tauschen': 'Swap languages',
  'Deutsch': 'German', 'Englisch': 'English', 'Französisch': 'French', 'Italienisch': 'Italian', 'Spanisch': 'Spanish',
  'Text eingeben oder einfügen …': 'Type or paste text …', 'Leeren': 'Clear', 'Kopieren': 'Copy', 'Zeichen': 'characters',
  'Datei übersetzen': 'Translate a file', 'Datei wählen': 'Choose file',
  'Text (.txt) oder Untertitel (.srt, .vtt) – Zeitmarken bleiben erhalten. Passt perfekt zu Voice to Text.':
    'Text (.txt) or subtitles (.srt, .vtt) – timestamps are kept. Works great with Voice to Text.',
  'Deutsch, Englisch, Französisch, Italienisch, Spanisch': 'German, English, French, Italian, Spanish',
  'Mozilla Bergamot – die Engine der Firefox-Übersetzung': 'Mozilla Bergamot – the engine behind Firefox Translations',
  'Pro Sprachrichtung einmalig ca. 23 MB, danach offline': 'About 23 MB once per direction, then offline',
  'Sprachmodell wird geladen (einmalig ca. 23 MB) …': 'Loading language model (about 23 MB, once) …', 'Wird übersetzt …': 'Translating …',
  'Übersetzt in': 'Translated in', 'Übersetzung fehlgeschlagen: ': 'Translation failed: ', 'Übersetzung kopiert.': 'Translation copied.',
  'Kopieren nicht möglich.': 'Copying is not possible.', 'Fertig:': 'Done:',
  'Der Übersetzer läuft vollständig in deinem Browser. Texte werden nur im Arbeitsspeicher deines Geräts übersetzt und nie an einen Server gesendet – die Seite darf technisch keine Verbindung zu anderen Servern aufbauen (Content Security Policy).':
    'The translator runs entirely in your browser. Texts are only translated in your device’s memory and never sent to a server – the page is technically not allowed to connect to other servers (Content Security Policy).',
  'Open Source': 'Open source',
  'Übersetzung: Bergamot Translator (MPL 2.0) mit den Sprachmodellen von Firefox Translations (Mozilla, MPL 2.0). Die Modelle werden von dieser Seite selbst ausgeliefert und beim ersten Gebrauch pro Sprachrichtung geladen. Zwischen zwei Sprachen ohne direktes Modell (z. B. Deutsch → Französisch) wird über Englisch übersetzt.':
    'Translation: Bergamot Translator (MPL 2.0) with the language models of Firefox Translations (Mozilla, MPL 2.0). The models are served by this site and loaded per direction on first use. Between two languages without a direct model (e.g. German → French) the translation goes via English.',
  'Qualität': 'Quality',
  'Die Modelle sind klein und schnell, aber nicht so stark wie grosse Cloud-Dienste. Für wichtige Texte bitte gegenlesen.':
    'The models are small and fast, but not as strong as large cloud services. Please proofread important texts.',
};
window.I18N_RULES = [
  [/^Übersetzt in /, 'Translated in '], [/^Wird übersetzt … (\d+) \/ (\d+)/, 'Translating … $1 / $2'],
  [/^Übersetzung fehlgeschlagen: /, 'Translation failed: '], [/^(\d+) Zeichen$/, '$1 characters'], [/^Fertig: /, 'Done: '],
];
