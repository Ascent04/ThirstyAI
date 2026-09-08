# Verifikation der Faktendatei v0.3

Kurzer Nachtrag zu [verification-v0.2.md](verification-v0.2.md) fuer das
v0.3-Addendum (`research/thirstyai-facts-v0.3-addendum.json`, Fakten
F038-F060).

## Uebernahme in data/facts.json

Commit `9963eb4` hat die Fakten **F038-F051** und **F054-F060** aus dem
Addendum in `data/facts.json` uebernommen (jeweils mit Notiz `origin:
addendum-v0.3/F0xx`). Inhaltlich in drei Gruppen:

- **F038**: US-Rechenzentren Gesamtstromverbrauch (LBNL 2025, 192 TWh).
- **F039/F040**: die beiden neuen PUE-Fakten `us-dc-pue-2024` (1.45,
  US-Durchschnitt) und `us-dc-pue-ai-2024` (1.145, US-Einrichtungen mit
  KI-Ausruestung), seit Zyklus C Grundlage der Default-PUE-Aufloesung
  (siehe methodology.md/-de.md).
- **F041-F051**: Ember-2025-Strommix-Werte (USA, EU-27, DE, IE, NL, SE,
  FR, FI, SG, IN, JP) - liegen in `data/facts.json` vor, werden aber
  noch von keinem Regionstabellen-Eintrag referenziert (siehe unten,
  "referenceYear" in methodology.md/-de.md).
- **F054-F060**: EEA-2024-Strommix-Werte (EU-27, SE, FI, FR, IE, NL, DE)
  - die min-Seite des jeweiligen Regionsraster-Eintrags fuer 2024, siehe
  `CARBON_REGION_TABLE_BY_YEAR` (`src/resolve.ts`).

**F052 und F053** wurden bewusst *nicht* als eigene Fakten uebernommen:
beide sind reine Ember-Bestaetigungen bereits vorhandener nationaler
Referenzwerte (F052: Ember DE 2024 = 336.38 gCO2e/kWh gegen die
bestehende UBA-Referenz 353 g; F053: Ember Singapur 2024 = 498.74 gCO2e/kWh
gegen die bestehende EMA-Referenz 402 g) - ein weiterer Fakt mit exakt
demselben Aussagewert (Ember-Methodik weicht von der amtlichen Quelle ab)
haette nichts Neues beigetragen. Fuer DE bleibt UBA, fuer SG bleibt EMA
die nationale Referenz (`CARBON_REGION_TABLE_BY_YEAR`,
`src/resolve.ts`), siehe [methodology.md](methodology.md) /
[methodology-de.md](methodology-de.md), Abschnitt "CO2-Intensitaet nach
Region".

## Ember-Quelle S17

Alle Ember-Werte im v0.3-Addendum (2024 und 2025) stammen aus derselben
Quelle **S17** (`data/facts.json`, Sources-Block): "Ember Yearly
Electricity Data 2024, Release 2026 (via Our World in Data CSV)". Die
2025-Zeilen derselben Datei wurden 2026-09-08 gezogen und gegen die
bereits am 2026-09-07 bestaetigten 2024-Werte derselben Datei geprueft
(siehe Fakt-Notizen, z.B. `grid-co2-ember-*` mit `origin:
addendum-v0.3/F051`).

## Bekannter offener Punkt: docs/crosscheck/

`docs/crosscheck/thirstyai.json` und `docs/crosscheck/results.md` sind
eine eingefrorene Momentaufnahme eines fruehen Programmlaufs - von vor
der Umstellung der Energie-Koeffizienten auf Wh pro 1.000 Output-Token
und von vor v0.3. Die `factIds` in `thirstyai.json` referenzieren noch
`us-dc-pue-2023` (die seither durch `us-dc-pue-ai-2024`/`us-dc-pue-2024`
ersetzte Default-PUE, siehe Zyklus C). Ein Neulauf der Gegenprobe gegen
den aktuellen Stand ist ein offener Punkt, nicht Teil dieses Zyklus.
