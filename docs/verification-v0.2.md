# Verifikation der Faktendatei v0.2

In einfachen Worten: Ein Teil der Fakten in `data/facts.json` stammt aus
einem Recherche-Dokument (dem "Addendum"), das ursprünglich nicht selbst
gegen die Originalquellen geprüft, sondern nur übernommen wurde. Dieses
Dokument beschreibt, wie diese Fakten nachträglich einzeln gegen ihre
Primärquellen geprüft wurden, was sich dabei bestätigt und was sich als
falsch oder ungenau herausgestellt hat.

## 1. Vorgehen

Vier Schritte, in dieser Reihenfolge:

1. **Addendum (Deep Research)**: `research/thirstyai-facts-v0.2-addendum.json`
   wurde am 2026-09-03 von Claude in einer claude.ai-Sitzung (Advanced
   Research) erstellt und von Mathias geprüft/freigegeben
   (`meta.created_by`). Es enthält 25 neue Fakten (F013-F037), 2 abgelehnte
   Kandidaten (`rejected`) und ist als "historisches Herkunftsdokument"
   gekennzeichnet: sein ursprünglicher Inhalt bleibt unverändert, bekannte
   Fehler stehen separat im Block `meta.errata`.
2. **Einpflegen**: Die Werte aus dem Addendum wurden in `data/facts.json`
   übernommen (Merge in Version 0.2, siehe `data/CHANGELOG.md`). Dabei
   trugen viele übernommene Fakten das Kürzel "aus Addendum, nicht selbst
   geöffnet" in `note` oder `verified` - ein offener Hinweis, dass die
   Primärquelle noch nicht direkt eingesehen wurde.
3. **Drei Runden Primärquellenprüfung**: In separaten claude.ai-Sitzungen
   (Modell Fable 5.1) wurden die Primärquellen der betroffenen Fakten
   tatsächlich geöffnet und die Zitate, Fundstellen und Werte geprüft.
   Commits `171f20c` (Runde 1, vier Fakten: EMA Singapur, RTE Frankreich,
   EPA eGRID USA, LBNL WUE-site) und `7631bd5` (Runden 2+3, weitere 18
   Fakten: Ember-Länderwerte, UBA Deutschland, Google/Gemini, Hugging
   Face AI Energy Score, Samsi et al., LBNL PUE/Energie/Wasser, Oviedo et
   al./Joule, Meta Model Card).
4. **Übertragung durch Claude Code**: Die in den claude.ai-Sitzungen
   gefundenen Ergebnisse wurden von Claude Code (diesem Werkzeug, ohne
   eigenen Web- oder PDF-Zugriff in dieser Aufgabe) in `data/facts.json`
   übertragen.

**Arbeitsteilung und das Feld `verified`**: Claude Code hat in diesem
Repository keinen Netzwerkzugriff und konnte daher keine der
Primärquellen selbst öffnen. Das Feld `verified` bei den betroffenen
Fakten macht das ausdrücklich sichtbar - es lautet durchgehend:

> "\[Datum\]: Primärquelle geöffnet und geprüft durch Claude in
> claude.ai-Sitzung (Fable 5.1); Übertragung durch Claude Code ohne
> eigene Quellenprüfung. Befund im Projekt-Chatverlauf."

Das heißt: `verified` bestätigt, dass *eine* Primärquellenprüfung
stattgefunden hat und durch wen - nicht, dass Claude Code sie selbst
durchgeführt hat. Wer die zugrunde liegende Sitzung nicht einsehen kann,
sollte `verified` als Herkunftsangabe lesen, nicht als eigenständigen
Beleg.

## 2. Die 22 übernommenen Fakten

Kein Addendum-Fakt wird über sein `value`-Feld verglichen (das wurde in
keiner Prüfrunde verändert) - die Spalten "confidence vorher/nachher"
vergleichen den im Addendum recherchierten Wert mit dem aktuellen Stand
in `data/facts.json`. Ein Rückgang bedeutet nicht zwangsläufig einen
Fehler in der Prüfung selbst, sondern oft eine ursprünglich zu optimistische
Ersteinschätzung im Addendum, die beim Einpflegen oder bei der Prüfung
nach unten korrigiert wurde.

```
Addendum-id  facts.json-id                 Ergebnis            confidence vorher->nachher
F013         llama31-70b-inf-energy        korrigiert          4 -> 3
F014         llama31-405b-inf-energy       korrigiert          4 -> 3
F015         mixtral-8x22b-inf-energy      bestätigt           3 -> 2
F016         dsr1-distill-70b-noreason     korrigiert          3 -> 2
F017         dsr1-distill-70b-reason       korrigiert          3 -> 2
F018         llama65b-inf-energy           Quelle umgestellt   4 -> 3
F019         llama65b-inf-energy-per-token korrigiert          4 -> 3
F020         gemini-energy                 bestätigt           4 -> 3
F022         grid-co2-ember-usa            bestätigt           4 -> 4
F023         grid-co2-egrid-us-2023        korrigiert          4 -> 4
F024         grid-co2-ember-eu-27          bestätigt           4 -> 4
F027         grid-co2-ember-niederlande    bestätigt           2 -> 4
F028         grid-co2-ember-schweden       bestätigt           2 -> 4
F029         grid-co2-ember-frankreich     bestätigt           3 -> 4
F030         grid-co2-ember-finnland       bestätigt           3 -> 4
F031         grid-co2-ema-sg-2024          korrigiert          5 -> 4
F032         grid-co2-ember-indien         bestätigt           4 -> 4
F033         grid-co2-ember-japan          bestätigt           4 -> 4
F034         us-dc-pue-2023                bestätigt           5 -> 4
F035         us-dc-wue-site-2023           korrigiert          4 -> 4
F036         us-dc-energy-2023             bestätigt           5 -> 5
F037         llama31-train-co2             bestätigt           5 -> 3
```

Anmerkungen zu einzelnen Zeilen:

- **F018** (`llama65b-inf-energy`): Der Wert 0.3 Wh stand im Addendum
  unter Samsi et al. (arXiv:2310.03003), tatsächlich lässt er sich dort
  nicht finden - er ist nur als Sekundärzitat bei Elsworth et al.
  (Google, arXiv:2508.15734) belegt. `source_id` wurde entsprechend
  umgestellt, `rating` von `BESTÄTIGT` auf `EINZELQUELLE` herabgestuft.
- **F034** (`us-dc-pue-2023`): Das Zitat war laut Addendum-Errata bereits
  vor dieser Prüfung korrekt in `data/facts.json` - dieser Fakt trägt
  deshalb als einziger der 22 kein `verified`-Feld, weil keine der drei
  Prüfrunden ihn eigens angefasst hat. Siehe offener Punkt unten.
- **F027-F030, F032, F033** (Ember-Länderwerte): Die confidence-Anhebung
  gegenüber dem Addendum-Wert geschah bereits beim Einpflegen in
  `data/facts.json` (Version 0.2), nicht in den Prüfrunden selbst - die
  Prüfrunden haben nur `verified` und eine Notiz zu abweichenden
  2025-Werten im selben Datensatz ergänzt.
- **F037** (`llama31-train-co2`): confidence sank von 5 (Addendum) auf 3
  (aktuell) - diese Änderung geschah ebenfalls beim ursprünglichen
  Einpflegen, nicht in den Prüfrunden. Die Prüfrunde hat nur das Zitat um
  den vollständigen Satz ergänzt und `verified` gesetzt.

## 3. Errata (aus `research/thirstyai-facts-v0.2-addendum.json`, `meta.errata`)

Zehn Einträge, alle datiert 2026-09-07:

1. **F035** (Wert): Das Addendum nannte 0.38 L/kWh; die Primärquelle
   (LBNL-2001637, S. 47-48, Text zu Fig. 4.7) sagt "stays just over
   0.36 L/kWh through 2023" - korrekter Wert 0.36 L/kWh.
2. **F034** (Zitat): Das im Addendum genannte Zitat ("... over a
   12-month reporting period ... approximately 1.40") ist kein
   Wortzitat aus dem Bericht. Korrektes Zitat: "The resulting annual
   average PUE falls from 1.6 in 2014 to 1.4 in 2023, as shown in
   Figure 4.6." Der Wert 1.4 selbst war unverändert richtig.
3. **F031** (Funktionale Einheit): "Average Operating Margin" steht so
   nicht auf der EMA-Seite; korrekt ist "je Netto-kWh Erzeugung (Grid
   Emission Factor)".
4. **F023** (Notiz): Die im Addendum genannte "5x Spreizung" zwischen
   US-Subregionen ist ungenau; korrekt sind 5.8x auf dem Festland (242.8
   bis 1405.0 gCO2e/kWh) bzw. 6.4x mit Puerto Rico. Die US-Zeile selbst
   lautet 770.884 lb CO2e/MWh, umgerechnet 349.7 gCO2e/kWh.
5. **F018** (Zitat): Wie oben - das Zitat steht nicht in Samsi et al.
   selbst, sondern nur als Sekundärzitat bei Elsworth et al. (Google).
6. **F019** (Zitat): Das Addendum-Zitat war nicht wortgleich mit dem
   Original; korrekt: "with length 512, we see that it takes about 3-4
   Joules for a output token".
7. **F025** (Wert): 363 gCO2/kWh (2024) stammte aus der Vorausgabe UBA
   CLIMATE CHANGE 13/2025; die aktuelle Fassung (16/2026) revidiert
   diesen Wert auf 353 gCO2/kWh.
8. **F026** (Wert): 256 gCO2/kWh wurde fälschlich als Irlands 2024-Wert
   geführt; es ist der Ember-Wert für 2025 (Release 2026: IE 256.54) -
   der tatsächliche 2024-Wert ist 270.91.
9. **F013** (Systemgrenze): "nur GPU (Zeus), H100, FP8, vLLM,
   Steady-State-Batching" ist falsch; tatsächlich wurde mit 4xH100 und
   BF16 (nicht FP8) gemessen, Oviedo et al. nehmen eine rechnerische
   Äquivalenz zu 8xH100/FP8 an.
10. **F013** (Zweitquelle): Der als Zweitmessung geführte Wert 0.05 Wh
    ist tatsächlich Oviedos eigene rechnerische FP8-Normalisierung, keine
    unabhängige Messung; Caravaca et al. (arXiv:2511.05597) haben
    stattdessen 0.08 Wh gemessen (FP16, 300 Output-Token).

## 4. Bekannte offene Punkte

- **Drei Addendum-Einträge wurden nicht in `data/facts.json`
  übernommen**:
  - **F021** (Token-Range 200-2000 pro Anfrage): im Addendum selbst als
    `VERWORFEN` eingestuft (kein belastbarer Primärbeleg gefunden). Lebt
    stattdessen als eigene Annahme (`reference-output-tokens`,
    `input-token-cost-share`) in `data/assumptions.json`.
  - **F025** (Strommix Deutschland, 363 gCO2/kWh): kein Wert-Treffer in
    `data/facts.json` für 2024 mit diesem Wert - die dort vorhandenen
    UBA-Werte (353 für 2024, 344 für 2025) sind die inzwischen
    revidierte Fassung (siehe Errata Nr. 7).
  - **F026** (Strommix Irland, 256 gCO2/kWh): kein Wert-Treffer - stellte
    sich als Jahres-Verwechslung heraus (256 ist der 2025-Wert, siehe
    Errata Nr. 8); `data/facts.json` führt weiterhin den 2024-Wert
    (270.91).
- **ML.ENERGY-Leaderboard nur sekundär belegt**: Es existiert keine
  eigenständige Quelle für das ML.ENERGY-Leaderboard in
  `data/facts.json` - die darauf gestützten Werte (u.a. F013, F014,
  F015) sind ausschließlich über ihre Zweitzitierung im Joule-Artikel
  (Oviedo et al.) belegt, das Leaderboard selbst (eine JavaScript-Seite)
  wurde nicht direkt gelesen.
- **AI-Energy-Score-Methodik nicht geöffnet**: Für die
  DeepSeek-R1-Distill-Werte (`dsr1-distill-70b-noreason`,
  `dsr1-distill-70b-reason`) stehen Batchgröße, Hardware und
  Messwerkzeug nicht im geprüften Blogbeitrag selbst, sondern nur auf
  einer separaten Methodikseite, die nicht geöffnet wurde -
  entsprechend auf confidence 2 gesetzt.
- **Aktualisierungskandidaten**: Ember hat inzwischen einen "Release
  2026"-Datensatz mit 2025-Werten veröffentlicht (in den betroffenen
  Fakten als Notiz vermerkt, aber nicht übernommen, da `data/facts.json`
  bei den 2024-Werten bleibt). Ebenso liegt von der LBNL ein
  2025er-Update des Rechenzentrums-Berichts vor (LBNL-2001758,
  Nachfolger von LBNL-2001637) - beide wurden nicht ausgewertet und sind
  Kandidaten für eine künftige v0.3-Aktualisierung.
