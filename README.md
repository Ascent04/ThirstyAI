# ThirstyAI

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

## Mitarbeit

Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für die Beweispflicht bei neuen
Fakten.
