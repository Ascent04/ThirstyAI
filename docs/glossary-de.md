---
title: Glossar
---
# Glossar

Nachschlagewerk für die Begriffe, die in ThirstyAI, in der Faktentabelle und auf der Rechner-Seite vorkommen. Zum Springen gedacht, nicht zum Lesen von vorn.

Stand 2026-09-10.

---

## Teil 1 — Begriffe des Verfahrens

Diese Begriffe stehen so in der Faktentabelle und auf der Rechner-Seite. Sie zu kennen ist nötig, um die Zahlen einzuordnen.

### Fakt
Ein einzelner Wert aus einer geprüften Quelle, mit ID, Einheit, Messgrenze, Bewertung und Quellenangabe. Fakten liegen in `data/facts.json`.

### Annahme
Ein Wert, den das Projekt selbst setzen musste, weil keine Quelle existiert. Annahmen liegen getrennt in `data/assumptions.json` und tragen das Rating ANNAHME. Die Trennung ist eine Regel: Datei folgt Rating.

### Rating
Die Belegstärke eines Fakts. Vier Stufen:

- **BESTÄTIGT** — Primärquelle plus unabhängige Zweitquelle.
- **EINZELQUELLE** — eine seriöse Quelle, keine Bestätigung.
- **UMSTRITTEN** — mehrere seriöse Quellen widersprechen sich bei derselben Größe.
- **ANNAHME** — keine Quelle; vom Projekt gesetzt.

### Vertrauensnote (confidence)
Eine Zahl von 1 bis 5 je Fakt. Sie bewertet, wie belastbar der einzelne Wert ist — unabhängig vom Rating. Ein BESTÄTIGT-Fakt kann eine niedrige Note tragen, wenn die Quelle selbst Unsicherheiten einräumt.

### Data confidence
Die schwächste Vertrauensnote unter den **belegten** Fakten, die in eine konkrete Rechnung eingegangen sind. Sagt: So gut ist die Datenlage für dieses Ergebnis.

### Method confidence
Die schwächste Vertrauensnote unter den **Annahmen**, die eingegangen sind. Sagt: So gut ist der Rechenweg dort, wo es keine Quelle gibt. Steht praktisch immer auf 1, weil der Overhead-Faktor in fast jeder Rechnung steckt.

### Messgrenze (measurement_boundary)
Was ein Wert einschließt und was nicht. Der wichtigste Kontext überhaupt: Ein Energiewert für „nur den Grafikchip" und einer für „das ganze Rechenzentrum" unterscheiden sich um Faktor 1,7 bis 2,4, obwohl beide „Wattstunden pro Anfrage" heißen.

### Systemgrenze
Dasselbe Prinzip eine Ebene höher: Welche Lebensphasen eines Modells sind mitgezählt? ThirstyAI rechnet nur den laufenden Betrieb. Training, Hardware-Herstellung und Rechenzentrumsbau sind nicht enthalten.

### Bandbreite (min / mid / max)
Drei Werte statt eines. **mid** ist der am besten belegte Wert, **min** und **max** sind die Extreme, die seriöse Quellen für dieselbe Größe angeben. Die Spanne bildet ab, wie unterschiedlich seriöse Leute rechnen — sie ist keine Messunsicherheit.

### Negativbefund
Die festgehaltene Feststellung, dass ein Anbieter nichts veröffentlicht hat, mit dem Datum der Prüfung. So ist sichtbar, was gesucht und nicht gefunden wurde.

### Addendum
Der Vorgang, mit dem neue Daten in die Tabelle kommen: Recherche, Prüfung, Übertragung, dann erst Verwendung im Code.

### verified
Das Feld, das festhält, wann und von wem eine Quelle tatsächlich geöffnet und der Wert dort nachgeschlagen wurde. Ein Fakt ohne dieses Feld ist ungültig.

### second_source
Die unabhängige Zweitquelle, die einen Wert bestätigt. Sie ist die Voraussetzung für das Rating BESTÄTIGT.

### Crosscheck
Ein Fakt, der bewusst **nicht** in die Rechnung eingeht, sondern zum Vergleich dient — etwa Mistrals Ökobilanz, die einen anderen Lebenszyklus abdeckt als ThirstyAI.

### Stellvertretermodell
Wenn für ein Modell keine Messung existiert (etwa GPT oder Claude, weil die Anbieter nichts veröffentlichen), rechnet ThirstyAI über ein offenes Modell ähnlicher Größe.

---

## Teil 2 — Begriffe der Sache

### Token
Die Einheit, in der KI-Modelle Text zerlegen — Wortteile, kurze Wörter, Satzzeichen. Grob 1,3 Token pro Wort im Deutschen und Englischen. Anbieter rechnen in Token ab.

### Input- und Output-Token
Input ist der Text, den das Modell liest; Output der Text, den es erzeugt. Output kostet deutlich mehr Rechenarbeit.

### Prefill und Decoding
Die zwei Phasen einer Anfrage. **Prefill** verarbeitet den Eingabetext auf einen Schlag. **Decoding** erzeugt die Antwort Token für Token und lässt sich nicht parallelisieren — deshalb dominiert es den Verbrauch.

### Cache
Der Zwischenspeicher, in dem ein Modell den bisherigen Gesprächsverlauf hält, damit er nicht bei jeder Anfrage neu verarbeitet werden muss. Wie viel Rechenarbeit das spart, ist die größte offene Frage im Modell.

### PUE — Power Usage Effectiveness
Wie viel Strom ein Rechenzentrum insgesamt braucht, geteilt durch den Strom, der in die Rechentechnik geht. 1,0 wäre verlustfrei. Moderne KI-Rechenzentren liegen bei etwa 1,145, der US-Durchschnitt über alle Rechenzentren bei 1,45.

### WUE — Water Usage Effectiveness
Liter Wasser, die ein Rechenzentrum vor Ort je Kilowattstunde Rechenstrom verdunstet. Kühltürme verdunsten Wasser.

### EWIF — Electricity Water Intensity Factor
Liter Wasser je Kilowattstunde, die bei der **Stromerzeugung** anfallen — Kraftwerkskühlung und Verdunstung aus Wasserkraft-Stauseen. Regional sehr verschieden.

### Scope 1, 2 und 3
Begriffe aus der CO₂-Bilanzierung, hier auf Wasser übertragen:

- **Scope 1** — direkt vor Ort. Beim Rechenzentrum: die Kühlung.
- **Scope 2** — indirekt über den zugekauften Strom. Beim Wasser: die Kraftwerkskühlung.
- **Scope 3** — alles Übrige in der Wertschöpfungskette. KI-Nutzung eines Unternehmens gehört hierhin.

### Entnahme und Verbrauch (withdrawal / consumption)
**Entnahme** ist alles Wasser, das einem Gewässer entnommen wird — auch das, was zurückfließt. **Verbrauch** ist nur der Teil, der verdunstet und dem Gewässer dauerhaft entzogen wird. Die beiden unterscheiden sich bei thermischer Stromerzeugung um Größenordnungen. ThirstyAI rechnet mit Verbrauch.

### Marktbasiert und standortbasiert
Zwei Wege, den CO₂-Gehalt von Strom zu bestimmen. **Standortbasiert** nimmt den tatsächlichen Strommix des Netzes. **Marktbasiert** rechnet Verträge und Herkunftsnachweise ein und fällt dadurch für Unternehmen mit Ökostromverträgen niedriger aus. ThirstyAI rechnet standortbasiert.

### GPU-only und Vollstack
**GPU-only** misst nur den Grafikchip. **Vollstack** misst den ganzen Server samt Prozessor, Arbeitsspeicher, Netzwerk und Rechenzentrum. Die meisten veröffentlichten Messungen sind GPU-only.

### Overhead-Faktor
Die Zahl, mit der von GPU-only auf Vollstack umgerechnet wird. Liegt zwischen 1,7 und 2,4. Eine Annahme, keine Messung — und der Grund, warum die Method confidence fast immer 1 ist.

### Ökobilanz (LCA)
Eine Bewertung nach ISO 14040/44, die alle Lebensphasen erfasst: Rohstoffgewinnung, Herstellung, Nutzung, Entsorgung. Deutlich weiter als ThirstyAIs Betriebsrechnung.

### ADP — Abiotic Resource Depletion
Ein Maß für den Verbrauch nicht erneuerbarer Rohstoffe, standardisiert auf Antimon-Äquivalent.

### Strommix
Die Zusammensetzung der Stromerzeugung einer Region nach Energieträgern. Bestimmt CO₂-Gehalt und Kraftwerkswasser.

### Bezugsjahr
Das Jahr, für das der Strommix gilt. Er ändert sich jährlich; eine Rechnung ohne Bezugsjahr ist nicht nachvollziehbar.

---

## Teil 3 — Abkürzungen

- **ADEME** — französische Umwelt- und Energieagentur
- **ADP** — Abiotic Resource Depletion, Rohstoffverschleiß
- **CSRD** — EU-Richtlinie zur Nachhaltigkeitsberichterstattung
- **EEA** — Europäische Umweltagentur
- **eGRID** — Emissionsdatenbank der US-Umweltbehörde
- **EWIF** — Electricity Water Intensity Factor
- **GWP100** — Treibhauspotenzial über 100 Jahre
- **LBNL** — Lawrence Berkeley National Laboratory
- **LCA** — Life Cycle Assessment, Ökobilanz
- **LLM** — Large Language Model, großes Sprachmodell
- **PUE** — Power Usage Effectiveness
- **SB 253** — kalifornisches Offenlegungsgesetz
- **UBA** — Umweltbundesamt
- **WCP** — Water Consumption Potential
- **WRI** — World Resources Institute
- **WUE** — Water Usage Effectiveness
- **Wh / kWh** — Wattstunde, Kilowattstunde
- **gCO₂e** — Gramm CO₂-Äquivalent
- **L/kWh** — Liter je Kilowattstunde, identisch mit m³/MWh
