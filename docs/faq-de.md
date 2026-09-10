# ThirstyAI – Fragen und Antworten

Stand 2026-09-09.

---

## Teil 1 – Was das Ding ist

### Was ist ThirstyAI in einem Satz?
Ein Taschenrechner mit hinterlegter Faktentabelle: Du gibst ihm ein KI-Modell, eine Menge erzeugten Texts und eine Region, und er sagt dir, wie viel Strom, Wasser und CO₂ das ungefähr gekostet hat – als Spanne, nicht als eine Zahl.

### Warum eine Spanne und nicht eine Zahl?
Weil niemand die genaue Zahl kennt. Die Anbieter (OpenAI, Anthropic, xAI, DeepSeek) veröffentlichen keine Werte pro Anfrage. Was es gibt, sind Messungen von Forschern an offenen Modellen, eine Google-Veröffentlichung für Gemini und Branchenstudien zu Rechenzentren. Diese Quellen widersprechen sich teilweise um den Faktor zwei bis fünf. Eine Einzelzahl würde diese Unsicherheit verstecken; die Spanne zeigt sie. Das ist der Kern des Projekts: ehrlich sein über das, was man nicht weiß.

### Was heißt „min / mid / max" genau?
- **mid** ist der beste verfügbare Wert, meist die nationale Referenz oder die am besten belegte Messung.
- **min** und **max** sind der kleinste und größte Wert, den seriöse Quellen für dieselbe Größe angeben.
- Wichtig: Die Spanne ist eine *Methodenspreizung* („so unterschiedlich rechnen seriöse Leute"), keine Messunsicherheit („so ungenau ist das Messgerät"). Das steht so in der Doku, weil ein Prüfer den Unterschied wissen will.

### Für wen ist das gedacht?
Für drei Gruppen: Entwickler, die ihre API-Nutzung beziffern wollen; Nachhaltigkeitsleute, die KI in eine Scope-3-Bilanz bekommen müssen; und Journalisten oder Neugierige, die verstehen wollen, warum die Zahlen in Schlagzeilen so weit auseinanderliegen.

### Was ist es nicht?
Kein Messgerät. Kein Ersatz für Anbieterangaben, sobald es die gibt. Kein Werkzeug, um einzelne Mitarbeiter zu bewerten. Und keine Wahrheit – ein dokumentierter, prüfbarer Rechenweg mit ausgewiesenen Annahmen.

### Wie benutzt man es?
Auf drei Wegen:
- **Web-Rechner**: eine einzelne Seite im Browser, Modell und Menge auswählen, Ergebnis mit Spannen und der vollständigen Liste der verwendeten Fakten.
- **Kommandozeile**: `calc` für eine einzelne Anfrage, `session` für eine ganze Arbeitssitzung.
- **Bibliothek**: `calculate(...)` aus eigenem TypeScript- oder JavaScript-Code aufrufen.

---

## Teil 2 – Wie die Rechnung läuft

### Was ist ein Token?
KI-Modelle zerlegen Text in Stücke, die Token heißen – Wortteile, ganze kurze Wörter, Satzzeichen. Im Deutschen und Englischen sind es grob 1,3 Token pro Wort. Eine Antwort mit 750 Wörtern sind etwa 1.000 Token. Die Anbieter rechnen in Token ab, deshalb ist das die natürliche Mengeneinheit.

### Warum zählen nur die Output-Token?
Weil das Erzeugen von Text (Output) den Großteil der Rechenarbeit macht. Das Lesen des Eingabetexts (Input) kostet auch etwas, aber deutlich weniger. ThirstyAI rechnet Input-Token mit einem Anteil von 0,1 gegenüber Output-Token an – das ist eine Annahme, keine Messung, und sie steht deshalb in `assumptions.json`, nicht in `facts.json`. Dass Input-Verarbeitung günstiger ist als Output-Erzeugung, ist qualitativ gestützt (u. a. Oviedo et al. 2025); der konkrete Faktor 0,1 ist es nicht.

### Was ist mit dem „Cache"?
Wenn du in einem langen Gespräch weiterschreibst, muss das Modell den bisherigen Verlauf nicht jedes Mal neu verarbeiten – es hat ihn im Zwischenspeicher (Cache). Cache-Lesen ist viel billiger als Neuverarbeitung. Wie viel billiger, ist die größte offene Frage im Modell: Der Cache-Faktor dominiert die Spanne bei langen Sitzungen stärker als jeder andere Wert.

### Die Rechenschritte, der Reihe nach
1. **Token → Wattstunden am Chip.** Aus der Faktentabelle: Wh pro 1.000 Output-Token für das jeweilige Modell oder ein Stellvertretermodell ähnlicher Größe.
2. **Chip → Rechenzentrum.** Multiplikation mit dem PUE-Faktor (Power Usage Effectiveness): Wie viel Strom das Gebäude zusätzlich zum Chip braucht für Kühlung, Netzteile, Beleuchtung. Aktuell 1,145 (moderne KI-Rechenzentren) bis 1,45 (US-Durchschnitt über alle Rechenzentren).
3. **Strom → Wasser vor Ort (Scope 1).** Kühltürme verdunsten Wasser. Der Faktor (Liter pro kWh) hängt am Chip-Strom, nicht am Gebäude-Strom – das ist ein Detail, das im Code richtig sitzen muss und heute bewiesen ist.
4. **Strom → Wasser im Kraftwerk (Scope 2).** Auch das Kraftwerk braucht Kühlwasser. Regionale Faktoren.
5. **Strom → CO₂.** Strommix der Region: Frankreich (Atom) sehr niedrig, Deutschland mittel, Indien hoch. Für 2024 gibt es pro Region drei Werte (min/mid/max) aus verschiedenen Datenbanken (UBA, Ember, EEA, eGRID).
6. **Ausgabe** als Spanne mit Bezugsjahr, Fakt-IDs und Vertrauensnoten.

### Was ist nicht enthalten?
Die Rechnung deckt den **laufenden Betrieb einer einzelnen Anfrage** ab: Strom am Chip, Aufschlag fürs Rechenzentrum, Kühlwasser vor Ort, Kraftwerkswasser und CO₂ des Strommixes. Ausdrücklich **nicht** enthalten sind:

- **Das Training des Modells.** Es fällt einmal an und müsste anteilig auf alle jemals gestellten Anfragen umgelegt werden. Wie viele das sind, weiß außer dem Anbieter niemand.
- **Die Herstellung der Hardware** (Chips, Server, Netzwerk).
- **Der Bau des Rechenzentrums.**
- **Das Gerät des Nutzers** und die Netzverbindung dorthin.

Diese Auslassung ist nicht klein. Mistral hat 2025 als bisher einziger Anbieter eine begutachtete Ökobilanz für ein konkretes Modell veröffentlicht (Mistral Large 2, gemeinsam mit ADEME und Carbone 4). Dort werden für eine Antwort von 400 Token 45 Milliliter Wasser und 1,14 Gramm CO₂e angegeben — über den gesamten Lebenszyklus, also inklusive anteiligem Training. Auf 1.000 Token hochgerechnet wären das rund 112 Milliliter. ThirstyAI kommt für dieselbe Menge auf wenige Milliliter, weil nur der Betrieb gezählt wird.

Der Unterschied liegt fast vollständig im Training: Laut derselben Studie entfallen 91 Prozent des Wasserverbrauchs auf Training und Inferenz zusammen, nur der Rest auf Bau und Herstellung.

Für eine Scope-3-Bilanz heißt das: Die Zahlen aus ThirstyAI sind der Betriebsanteil, nicht der Gesamtfußabdruck. Wer den vollständigen Lebenszyklus braucht, kommt an einer Ökobilanz des jeweiligen Modells nicht vorbei — und die gibt es bisher für genau ein Modell.

### Was ist der „Overhead-Faktor"?
Die meisten veröffentlichten Messungen erfassen nur den Grafikchip (GPU), nicht den ganzen Server mit Prozessor, Arbeitsspeicher, Netzwerk und Speicher. Der Overhead-Faktor rechnet von der einen Grenze auf die andere um; er liegt zwischen 1,7 und 2,4. Er ist eine Annahme, keine Messung – und weil er in fast jeder Rechnung steckt, begrenzt er die Methoden-Vertrauensnote (siehe unten) nach unten.

### Was ist „Scope 1" und „Scope 2" beim Wasser?
Begriffe aus der CO₂-Bilanzierung, hier auf Wasser übertragen: Scope 1 = direkt vor Ort (Kühlung im Rechenzentrum), Scope 2 = indirekt über die Stromerzeugung (Kraftwerkskühlung). Beides zusammen ist der Wasserfußabdruck.

### Warum gibt es ein „Bezugsjahr"?
Weil der Strommix sich jedes Jahr ändert. Die CO₂-Tabelle ist nach Jahr geordnet; heute gibt es die Zeile 2024. Wer 2025 rechnen will, muss warten, bis alle Quellen ihre 2025-Werte veröffentlicht haben (Ember ist da, EEA und eGRID fehlen noch). Ein unbekanntes Jahr wirft einen Fehler statt stillschweigend das falsche zu nehmen.

---

## Teil 3 – Die Daten: Woher, wie geprüft, wie sicher

### Woher kommen die Zahlen?
Aus wissenschaftlichen Veröffentlichungen (arXiv-Preprints und begutachtete Paper), Behördendaten (Umweltbundesamt, EEA, US-EPA eGRID), Branchenstudien (Lawrence Berkeley National Laboratory zu US-Rechenzentren), Anbieterangaben (Google, Meta-Modellkarten) und Datenbanken (Ember via Our World in Data).

### Wie viele Fakten sind es?
Zwei Zahlen, die man auseinanderhalten muss:
- **`facts.json` allein**: 124 Fakten aus 27 Quellen – alles, was in einer externen Quelle steht.
- **Die zusammengesetzte Tabelle**, mit der gerechnet wird: 144 Fakten aus 35 Quellen. Der Unterschied sind die Annahmen aus `assumptions.json` und die Modell-Einordnungen aus `models.json`.

Der Web-Rechner zeigt die zweite Zahl an, weil das die Tabelle ist, die tatsächlich rechnet.

### Wie sicher bin ich mit Daten aus dem Web? Sind die geprüft?
Das ist die richtige Frage, und die Antwort ist ein Verfahren, kein Versprechen:

1. **Nur Primärquellen.** Kein Wert kommt aus einem Blogartikel, einer Zusammenfassung oder einer Schlagzeile. Wenn ein Wert in einem Artikel steht, wird die dort zitierte Originalquelle geöffnet und der Wert dort nachgeschlagen. Steht er dort nicht, kommt er nicht in die Tabelle.
2. **Jede Quelle wurde tatsächlich geöffnet.** Nicht „ist bekannt", sondern: PDF heruntergeladen, Seite gelesen, Tabelle gefunden, Wert abgeschrieben. Wo ein Fakt in einer dokumentierten Prüfrunde gegen seine Primärquelle geprüft wurde, hält das `verified`-Feld fest, wann und von wem. Nicht jeder Fakt trägt das Feld; `docs/verification-v0.2.md` und `docs/verification-v0.3.md` halten fest, welche Fakten geprüft wurden und wie.
3. **Rating nach Belegstärke.** Jeder Fakt trägt eine von drei Noten: BESTÄTIGT (Primärquelle plus unabhängige Zweitquelle), EINZELQUELLE (eine seriöse Quelle, keine Bestätigung), UMSTRITTEN (seriöse Quellen widersprechen sich). Zusätzlich eine Vertrauensnote 1–5. Was nur geschätzt ist, heißt ANNAHME und liegt in einer eigenen Datei.
4. **Kontext wird mitgeschrieben.** Ein Messwert ohne Messgrenze ist wertlos: „GPU-only" (nur der Chip) und „Vollstack" (ganzes Rechenzentrum) unterscheiden sich um Faktor 1,7 bis 2,4. Jeder Fakt trägt seine Messgrenze, damit man nicht Äpfel mit Birnen rechnet.
5. **Negativbefunde werden festgehalten.** Wenn ein Anbieter nichts veröffentlicht, steht das als Fakt in der Tabelle, mit Prüfdatum. So sieht man, was gesucht und nicht gefunden wurde – und wann man nachschauen sollte.
6. **Werte werden nie überschrieben.** Kommt eine neue Zahl, wird ein neuer Fakt angelegt; der alte bleibt. Man kann jede Rechnung von früher wiederholen.
7. **Vier-Augen-Prinzip.** Recherche und Prüfung der Quelle einerseits, Eintragen in die Datei andererseits sind getrennte Rollen. Wer einträgt, prüft nicht selbst – und schreibt das so ins `verified`-Feld.

Wie sicher bist du also? So sicher wie die beste Quelle, die es gibt, und das Rating sagt dir, wie gut die ist. Bei UMSTRITTEN oder Vertrauensnote 2 weißt du: Hier ist die Spanne breit, weil die Welt es nicht besser weiß – nicht, weil das Werkzeug schlampig war.

### Was bedeuten „Data confidence" und „Method confidence"?
Zwei getrennte Vertrauensnoten, jeweils von 1 bis 5:

- **Data confidence** ist die schwächste *belegte* Quelle, die in diese konkrete Rechnung eingegangen ist. Sie sagt: So gut ist die Datenlage.
- **Method confidence** ist die schwächste *Annahme*, die eingegangen ist. Sie sagt: So gut ist der Rechenweg dort, wo es keine Quelle gibt.

Die Trennung ist nötig, weil eine einzelne Note irreführend wäre. Der Overhead-Faktor ist eine Annahme mit Note 1 und steckt in fast jeder Rechnung – eine gemeinsame Note wäre deshalb fast immer 1, egal wie gut die Quellen sind. Getrennt sieht man: Die Quellenarbeit kann bei 4 liegen, während die Methode bei 1 liegt. Beide Zahlen zusammen mit der Faktenliste darunter erlauben es, die Noten selbst nachzurechnen.

### Was ist der Unterschied zwischen `facts.json` und `assumptions.json`?
`facts.json`: alles, was in einer Quelle steht (Ratings BESTÄTIGT, EINZELQUELLE, UMSTRITTEN). `assumptions.json`: alles, was das Projekt selbst setzen musste, weil es keine Quelle gibt – der Input-Anteil 0,1, der Cache-Faktor, der Overhead-Faktor. Die Trennung ist eine Regel: Datei folgt Rating. So kann ein Prüfer sofort sehen, wo Belege enden und Schätzung anfängt. Im Web-Rechner entspricht das den zwei getrennten Tabellen unter dem Ergebnis.

### Wie kommen neue Daten hinein?
Der Weg heißt „Addendum" und läuft in Zyklen: Recherche (Quellen öffnen, Werte finden, Rating vergeben, Befund ablegen), Review (Ist die Quelle seriös, ist das Rating richtig, gehört der Wert hinein?), Übertragung (neue Fakten anlegen, IDs vergeben, `verified`-Feld setzen), Verwendung (erst wenn der Fakt drin ist, wird entschieden, ob und wie der Code ihn benutzt – mit Vorhersage der Zahlenwirkung).

### Wie oft muss man aktualisieren?
Strommix: jährlich, wenn die Behörden ihre Werte veröffentlichen (Frühjahr bis Herbst des Folgejahres). Modellmesswerte: wenn neue Studien erscheinen, grob quartalsweise nachschauen. Negativbefunde: am Prüfdatum wiederholen. Ein Kalender dafür gibt es noch nicht – das wäre ein sinnvolles Werkzeug.

### Was ist der EcoLogits-Crosscheck?
EcoLogits ist ein französisches Open-Source-Projekt, das dasselbe versucht wie ThirstyAI, mit anderer Methode. Der Crosscheck rechnet dieselben Beispiele mit beiden und vergleicht. Stimmen die Größenordnungen, ist das eine unabhängige Bestätigung; weichen sie ab, weiß man, wo die Methoden auseinandergehen. Der letzte Lauf ist veraltet, weil sich seither die Token-Einheit und die PUE/CO₂-Intervalle geändert haben.

Ein zweiter Abgleich ist möglich, aber nur für ein Modell: Mistrals Ökobilanz für Mistral Large 2. Weil sie den gesamten Lebenszyklus umfasst und ThirstyAI nur den Betrieb, ist das kein Vergleich gleicher Zahlen, sondern ein Maß dafür, wie viel die Systemgrenze ausmacht.

---

## Teil 4 – Anwendung in der Firma

### Was bringt das für die CO₂-Bilanz?
KI-Nutzung gehört in Scope 3 (eingekaufte Dienstleistungen). Bisher fehlt sie dort oder steckt in einer Cloud-Pauschale, weil die Anbieter keine Werte liefern. ThirstyAI ermöglicht die Rechnung „Menge × belegter Emissionsfaktor" – wie beim Strom oder Fuhrpark – mit ausgewiesener Bandbreite. Das ist prüfbar; eine erfundene Einzelzahl nicht.

### Woher bekomme ich die Token, ohne Chats zu lesen?
Aus der Abrechnung. Jeder Firmenvertrag (Azure OpenAI, Microsoft Copilot, Anthropic Enterprise, Google) hat eine Admin-Konsole mit Nutzungsstatistik: Token pro Monat, Modell, Abteilung. Der Rechnungsexport listet Input-, Output- und Cache-Token. Notlösung ohne Export: Rechnungsbetrag geteilt durch Listenpreis pro Million Token. Inhalte sieht dabei niemand.

### Und der Datenschutz?
Auch Nutzungsmengen pro Person sind personenbezogen. Deshalb: vor der ersten Auswertung Freigabe einholen, Auswertung auf Abteilungs- oder Konzernebene, nie pro Mitarbeiter.

### Kann ich einen ChatGPT-Chat messen?
Schätzen, ja – mit zwei Einschränkungen. OpenAI veröffentlicht nichts, also rechnet ThirstyAI über Stellvertretermodelle ähnlicher Größe. Und die ChatGPT-Oberfläche zeigt keine Token; man schätzt aus der Wortzahl (× 1,3) oder exportiert den Chat. Größenordnung: eine 300-Wort-Antwort liegt bei grob 0,3–3 Wh Strom (Handy-Ladung: 10–15 Wh) und einigen Millilitern Wasser. Die Breite ist die Aussage.

### Was passiert, wenn Anbieter irgendwann echte Zahlen liefern?
Zwei Regelwerke greifen, aber keines liefert Werte pro Anfrage:

**Kalifornien, SB 253.** Verlangt Scope 1, 2 und 3 auf **Unternehmensebene** — Gesamtemissionen, nicht Verbrauch je Anfrage oder Token. Die erste Frist der kalifornischen Umweltbehörde liegt beim 10. November 2026, Scope 3 folgt 2027. Gegen das Gesetz läuft eine Klage; ein Urteil könnte es noch kippen. Wichtig für ThirstyAI: Auch wenn alles wie geplant in Kraft tritt, entsteht daraus kein Wert pro Anfrage. Und die Pflicht trifft die Konzerne, die Rechenzentren betreiben — nicht zwangsläufig die Modellanbieter, die dort einmieten.

**EU AI Act, Anhang XI.** Verlangt von Anbietern allgemeiner KI-Modelle die Dokumentation des bekannten oder geschätzten Energieverbrauchs — bezogen auf Training und Entwicklung, nicht auf den Betrieb, und gegenüber der Behörde, nicht öffentlich.

Wenn ein Anbieter freiwillig einen belastbaren Wert veröffentlicht, wird er als neuer Fakt angelegt (BESTÄTIGT oder EINZELQUELLE), der Code verweist darauf, die Stellvertreter-Fakten bleiben als Historie. Die Methode ändert sich nicht — nur die Spanne wird schmaler. Bisher hat genau ein Anbieter das getan: Mistral, mit einer Ökobilanz statt einer Betriebszahl.

---

## Teil 5 – Bekannte Lücken (ehrlich)

- **Langer Kontext.** Die Energiewerte pro Token stammen aus Kurzkontext-Benchmarks. Bei Sitzungen mit 300.000+ Token Kontext ist der Verbrauch pro Output-Token systematisch höher. Dokumentiert, nicht gelöst.
- **Overhead-Faktor** ist eine Annahme und begrenzt die Method confidence in praktisch jeder Rechnung auf 1.
- **Cache-Faktor** ist eine Annahme und dominiert die Spanne bei langen Sitzungen.
- **Input-Anteil 0,1** ist eine Annahme, nur qualitativ gestützt.
- **Kraftwerkswasser** stammt überwiegend aus dem Datenjahr 2015; für einige Länder liegen zwei Quellen mit abweichenden Werten vor.
- **Indien, Japan**: nur eine CO₂-Quelle, also min = mid = max.
- **Anbieter-Negativbefunde** müssen regelmäßig neu geprüft werden.
- **Kein Kalender** für Quellen-Aktualisierung.
- **Training nicht enthalten.** Die Rechnung deckt nur den Betrieb ab. Die einzige verfügbare Ökobilanz eines Modells legt nahe, dass anteiliges Training die Größenordnung dominieren kann.
- **Kraftwerkswasser: zwei Datensätze mit unterschiedlicher Geografie.** Für Deutschland, Irland, die Niederlande, Schweden und Finnland liegen zwei Quellen mit abweichenden Werten vor; sie werden als Spanne geführt. Bei den Niederlanden und Irland ist der eine Wert zudem ein Mehrländer-Regionswert, kein Landeswert. Für Deutschland liegen die beiden Werte (WRI Anhang 2: 1,947 L/kWh, Lohrmann: 2,04 L/kWh) nur rund 5 Prozent auseinander, anders als in den übrigen Fällen. Für Dänemark unterscheiden sich beide Quellen um Faktor 5,8, ohne dass sich die Ursache rekonstruieren ließe — die zugrundeliegende Datenbank ist nicht einsehbar.
