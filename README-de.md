# ThirstyAI

*[English](README.md)*

**Status: in Entwicklung**

## Zweck

ThirstyAI ist eine TypeScript-Bibliothek, die aus Modellname, Token-Zahl und
Region den Wasser-, Strom- und CO2-Verbrauch einer KI-Anfrage schätzt. Das
Ergebnis ist bewusst eine Bandbreite (Minimum, Mittelwert, Maximum), keine
einzelne Zahl, weil die zugrunde liegenden Messwerte aus unterschiedlichen
Systemgrenzen, Regionen und Methoden stammen. Zu jedem Ergebnis liefert die
Bibliothek die verwendeten Quellen und eine Konfidenzeinstufung (1-5) mit,
damit sichtbar bleibt, wie belastbar eine Zahl ist.

Die Bibliothek trifft keine Netzwerkzugriffe zur Laufzeit und hat keine
Laufzeit-Abhängigkeiten. Alle Fakten liegen offline in `data/facts.json`
und sind einzeln mit Quelle, Fundstelle und Wortzitat belegt.

## Installation

Noch nicht auf npm veröffentlicht. Bis dahin aus dem Quellcode nutzen:

```bash
git clone https://github.com/Ascent04/ThirstyAI.git
cd ThirstyAI
npm install
npm run build
npm test
```

## Kommandozeile

```bash
$ node dist/cli.js calc --model claude-sonnet-5 --out 1000 --region DE
ThirstyAI — claude-sonnet-5 (class mid, recognized via class-claude-sonnet-5)
Tokens: in=0 out=1000 · Region: DE · Reference year: 2024

              min     mid     max
energy Wh   0.216   0.773    1.05
water ml    0.500    1.77    2.42
co2 g      0.0628   0.273   0.371

Data confidence: 2/5
Method confidence: 1/5
Boundary: gpu-only
Facts: …
Assumptions: …
```

```bash
$ node dist/cli.js session test/fixtures/claude-code-sample.jsonl --region DE
ThirstyAI session — test/fixtures/claude-code-sample.jsonl
Records: 2 (skipped unparsable: 1, skipped synthetic: 1)
Tokens: input=35 output=190 cache-create=50 cache-read=200 · Region: DE · Reference year: 2024

=== claude-sonnet-5 (class mid, recognized via class-claude-sonnet-5) ===
              min     mid     max
energy Wh  0.0428   0.155   0.211
water ml   0.0993   0.355   0.485
co2 g      0.0125  0.0547  0.0745

Wh per 1,000 output tokens (all compute): 0.225/0.816/1.11

Data confidence: 2/5
Method confidence: 1/5
Boundary: gpu-only
Facts: …
Assumptions: …
Cache-read compute share: 0/0.1/0.1 (assumption cache-read-compute-share-anthropic)
```

Optionen von `calc`:

| Option | Bedeutung |
| --- | --- |
| `--model <name>` | Modellname (Pflicht) |
| `--out <n>` | Anzahl Output-Token (Pflicht) |
| `--in <n>` | Anzahl Input-Token (Default 0) |
| `--region <code>` | Regionscode, z.B. `DE`, `US` |
| `--provider <name>` | Cloud-Anbieter, beeinflusst den verwendeten PUE-Fakt |
| `--year <yyyy>` | Bezugsjahr fuer das CO2-Regionsraster (Default 2024) |
| `--json` | gibt das `Result`-Objekt als JSON statt als Tabelle aus |
| `--help` | gibt die Aufrufsyntax aus |

Optionen von `session`:

| Option | Bedeutung |
| --- | --- |
| `<file>` | Pfad zu einem Claude-Code-Sitzungsprotokoll (JSONL, Pflicht) |
| `--region <code>` | Regionscode, gilt fuer alle Modelle der Sitzung |
| `--year <yyyy>` | Bezugsjahr fuer das CO2-Regionsraster (Default 2024) |
| `--json` | gibt `{ file, records, skipped, tokens, region, referenceYear, models, total }` als JSON aus |

Exit-Codes: `0` Erfolg, `1` Bedienfehler (fehlendes/ungueltiges Argument, fehlende oder nicht lesbare Datei, oder - bei `session` - keine erkannte Nutzungszeile in der Datei), `2` ein Fehler aus der Bibliothek (z.B. ein unbekanntes `--year`).

Unbekannte Modellnamen fallen auf die Klasse `frontier` zurueck (bewusst konservativ - schaetzt eher zu hoch als zu niedrig).

Confidence ist das Minimum ueber alle verwendeten Koeffizienten; bei gpu-only-Modellen ist sie derzeit durch ANNAHME-Fakten (Overhead-Faktor, Wasser-Fallback am Standort) auf 1/5 gedeckelt. Die Assumptions-Zeile sagt mehr als der Zahlenwert.

„Wh per 1,000 output tokens (all compute)" gewichtet Input- und Cache-Token in ein Output-Token-Aequivalent ein und teilt die Gesamtenergie dadurch - deshalb liegt der Wert bei Sitzungen mit langen Kontexten deutlich ueber dem reinen `calc`-Wert pro Output-Token.

## Web-Rechner

Eine einzelne statische Seite führt dieselbe Berechnung im Browser aus —
kein Build-Schritt, keine externen Anfragen. Sie listet jeden
verwendeten Fakt und jede Annahme mit Quellenlinks auf.

Die Seite wird über GitHub Pages veröffentlicht, sobald das Repository
öffentlich ist. Bis dahin kann sie lokal bereitgestellt werden:

```bash
npm run build:web
python3 -m http.server 8080 --directory docs
```
Dann http://localhost:8080/calculator/ öffnen.

## Nutzung

```typescript
import { loadFacts, calculate } from "thirstyai";

const table = loadFacts([
  "node_modules/thirstyai/data/facts.json",
  "node_modules/thirstyai/data/assumptions.json",
  "node_modules/thirstyai/data/models.json",
]);

const result = calculate(
  { model: "claude-3-5-sonnet", tokensIn: 200, tokensOut: 300, region: "DE" },
  table,
);

console.log(
  `Wasser (Standort): ${result.waterScope1.min.toFixed(2)}-` +
    `${result.waterScope1.max.toFixed(2)} mL (Mitte ${result.waterScope1.mid.toFixed(2)})`,
);
console.log(
  `Wasser (Stromerzeugung): ${result.waterScope2.min.toFixed(2)}-` +
    `${result.waterScope2.max.toFixed(2)} mL`,
);
console.log(
  `CO2 (Scope 2): ${result.co2Scope2.min.toFixed(3)}-${result.co2Scope2.max.toFixed(3)} g`,
);
console.log(`Konfidenz: ${result.confidence}/5, Quellen: ${result.factIds.join(", ")}`);
```

`loadFacts` liest und prueft die Faktendateien, `calculate` liefert das
Ergebnis. Beide Aufrufe sind synchron und greifen nicht auf das Netzwerk zu.
Alle drei Dateien sind noetig: `facts.json` enthaelt die belegten Messwerte,
`assumptions.json` die eigenen ANNAHME-Fakten (z.B. Input-Kostenanteil,
Overhead-Faktor), `models.json` bekannte Modellgroessen (Parameterzahl) fuer
die Klassifikation - auf sie alle greift `calculate` je nach Modell und
Berechnungsschritt zurueck; fehlt eine, bricht die Berechnung mit einem
Fehler zur fehlenden Fakt-ID ab.

## Was die Zahlen bedeuten

- **waterScope1** und **waterScope2** sind getrennt, nicht addiert:
  waterScope1 ist Kuehlwasser, das am Rechenzentrum selbst verdunstet;
  waterScope2 ist Wasser, das bei der Stromerzeugung fuer die Anlage
  verbraucht wird. Beide stammen aus unterschiedlichen Quellen und
  Systemgrenzen, eine Summe waere schwerer nachvollziehbar als die
  beiden Einzelwerte.
- **co2Scope2** deckt bewusst nur die Emissionen des Stromverbrauchs ab
  (location-/market-based). Herstellung der Hardware (Scope 3) und
  Kaeltemittel (Scope 1) sind nicht enthalten - der Feldname macht das
  absichtlich sichtbar, statt eine nicht herleitbare Gesamtzahl zu
  suggerieren. Details und ein konkretes Beispiel dieser Luecke stehen
  in [docs/methodology-de.md](docs/methodology-de.md).
- **confidence** (1-5) ist das Minimum der Konfidenzwerte aller fuer
  dieses Ergebnis tatsaechlich verwendeten Koeffizienten - mit
  Ausnahme einiger universeller Annahmen, die in jede Berechnung
  eingehen und die Zahl sonst wertlos machen wuerden (Begruendung in
  docs/methodology-de.md). Eine niedrige confidence heisst nicht
  "falsch", sondern "auf duennerer Quellenlage geschaetzt" - z.B. weil
  die Region unbekannt war und auf US-Durchschnittswerte
  zurueckgefallen wurde. `factIds` und `assumptions` im Ergebnis zeigen,
  welche Fakten und eigenen Annahmen konkret eingeflossen sind.

## Abgleich mit EcoLogits

Die Ergebnisse von ThirstyAI wurden offline mit
[EcoLogits](https://ecologits.ai/) (Python, GenAI Impact, JOSS 2025) für
zehn Fälle über fünf Modellfamilien verglichen. Bei Modellen mit
öffentlich bekannter Größe stimmen beide Werkzeuge auf ±30% überein;
bei proprietären Modellen weichen sie um den Faktor 3-6 voneinander ab,
weil beide die Modellgröße schätzen müssen. Vollständige Tabellen und
die Begründung für jede Abweichung:
[docs/crosscheck/results.md](docs/crosscheck/results.md).

## Verwandte Projekte

- **EcoLogits** (Python, [JOSS 2025](https://joss.theoj.org/)): schätzt
  ebenfalls Umweltwirkungen von LLM-Anfragen, mit Fokus auf Python-SDKs
  großer Anbieter. ThirstyAI unterscheidet sich in drei Punkten:
  - **Quellenangabe pro Koeffizient**: jeder verwendete Zahlenwert trägt
    seine eigene Quellen-ID, Fundstelle und Konfidenz, statt eines
    Gesamt-Disclaimers.
  - **Scope-Trennung beim Wasser**: Wasserverbrauch (verdunstet) und
    Wasserentnahme (überwiegend zurückgeführt) werden nicht vermischt,
    da Anbieter beide Begriffe unterschiedlich verwenden.
  - **TypeScript** statt Python, für Einsatz in Node- und Web-Umgebungen.

## Faktendatei

`data/facts.json` ist eine kuratierte Sammlung öffentlich belegter
Messwerte und Schätzungen (Version 0.2, Stand 2026-09-03). Sie wird nicht
verändert. Eigene, klar gekennzeichnete Annahmen liegen separat in
`data/assumptions.json`.

Wie die aus dem Recherche-Addendum übernommenen Fakten nachträglich
gegen ihre Primärquellen geprüft wurden, steht in
[docs/verification-v0.2.md](docs/verification-v0.2.md).

## FAQ

Ausführlichere Antworten zu Methode, Datenherkunft und bekannten Lücken:
[English](docs/faq.md) · [Deutsch](docs/faq-de.md)
Begriffe zum Nachschlagen: [English](docs/glossary.md) · [Deutsch](docs/glossary-de.md)

## Mitarbeit

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für die Beweispflicht bei neuen
Fakten.
