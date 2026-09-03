# Mitarbeit

## Beweispflicht für neue Fakten

ThirstyAI lebt davon, dass jede Zahl in `data/facts.json` nachprüfbar ist.
Ein Pull Request, der einen neuen Fakt oder eine neue Quelle hinzufügt,
**muss** für jede Zeile folgende Felder ausfüllen:

- **Quelle**: Titel, Herausgeber, Jahr, URL.
- **Fundstelle**: Kapitel, Tabelle, Abschnitt oder Seitenzahl innerhalb der
  Quelle, an der der Wert steht.
- **Wortzitat**: der exakte Originalsatz oder -wert aus der Quelle, als
  Zitat, nicht paraphrasiert.
- **Systemgrenze** (`measurement_boundary`): was genau gemessen oder
  berechnet wurde (z. B. nur GPU, Vollstack inkl. PUE, Modellrechnung aus
  Annahmen).
- **Einstufung** (`rating`): eine von `BESTÄTIGT` (Primärquelle plus
  unabhängige Zweitquelle), `EINZELQUELLE` (eine seriöse Primärquelle),
  `UMSTRITTEN` (Quellen widersprechen sich) oder `ANNAHME` (keine Quelle,
  eigene Schätzung).

**Pull Requests ohne diese Felder werden abgelehnt.**

## Eigene Annahmen

Werte ohne Beleg gehören nicht in `data/facts.json`, sondern in
`data/assumptions.json`, mit `rating: "ANNAHME"`, `confidence: 1` und
`source_id: "A-THIRSTYAI"`.

## Tests

Jede Änderung an Code oder Daten braucht einen Test. Ein Pull Request ohne
grünen Testlauf (`npm test`) wird nicht angenommen.
