# Claude-Code-Sitzungsprotokoll-Leser

`src/readers/claudeCode.ts` liest ein Claude-Code-Sitzungsprotokoll
(JSONL) und liefert rohe Zählwerte pro Nachricht. Interner Baustein,
nicht über `src/index.ts` exportiert. `examples/claude-code-session.ts`
zeigt, wie daraus eine Messung durch `calculate` wird (Kopie der
Sitzungsdatei nach `/tmp`, Aggregation pro Modell, zwei `calculate()`-
Aufrufe mit min/max-tokensIn, äußere Grenzen der Ergebnis-Intervalle
zusammengeführt).

## Datenschutz

Gelesen werden ausschließlich Zählfelder: `timestamp`, `message.id`,
`message.model`, `message.usage.*`. `message.content` wird nie geparst
oder inspiziert - keine Nachrichteninhalte werden gelesen, ausgegeben
oder in Fixtures kopiert (Test-Fixtures enthalten ausschließlich
erfundene Platzhaltertexte).

## Deduplizierung

Eine einzelne Anfrage kann sich über mehrere JSONL-Zeilen erstrecken
(ein Streaming-Chunk pro Content-Block), alle mit identischer
`message.usage`. Der Leser dedupliziert über `message.id` und behält
den Datensatz mit dem größten `output_tokens`.

## Warum thinking_tokens nicht gelesen wird

Empirisch geprüft (153 Nachrichten mit einem `thinking`-Block):
`output_tokens` ist nie kleiner als `output_tokens_details.thinking_tokens`,
und beide korrelieren mit 0.977 über eine Spanne von 16 bis 38222 - das
Feld `output_tokens` schließt `thinking_tokens` demnach ein. Ein
separates Auslesen von `thinking_tokens` ist für die Gesamtzählung
daher nicht nötig.

## Cache-Read-Intervall

`toInputTokenRange(record, cacheReadComputeShare)` behandelt Cache-Reads
als Intervall statt als festen Wert:

- **min** schließt `cacheReadTokens` komplett aus - ein Cache-Treffer
  braucht im Idealfall keine erneute Verarbeitung.
- **max** gewichtet `cacheReadTokens` mit `cacheReadComputeShare`.
- `cacheCreationTokens` zählen in beiden Fällen voll, da sie in jedem
  Fall frisch verarbeitete Eingabe sind.

`cacheReadComputeShare` wird vom Aufrufer aus
`data/assumptions.json` geladen (Fakt `cache-read-compute-share-anthropic`,
value 0.1 - Anthropics eigenes Preisverhältnis für Cache-Reads, siehe
Fakt-Notiz und Quelle dort) und nicht in `claudeCode.ts` hart codiert.
Frühere Fassung dieses Werkzeugs zählte Cache-Reads im Maximum wie
volle Input-Token (Faktor 1.0) - das ergab für stark gecachte Sitzungen
(siehe unten) eine Obergrenze um den Faktor 10 zu hoch.

## Messwerte (Wh pro 1.000 Output-Token)

`examples/claude-code-session.ts`, ausgeführt gegen eine reale
Claude-Code-Sitzung (Modell `claude-sonnet-5`), aggregiert je einmal mit
Cache-Read-Compute-Share-Faktor 0 (min), 0.1 (mid) und 0.1 (max) (siehe
"Cache-Read-Intervall" oben) und rechnet das Ergebnis auf Wh pro 1.000
Output-Token um:

- **Stand nach v0.3** (aktuelle Fakten, Bezugsjahr 2024, Default-PUE
  asymmetrisch 1.145/1.45/1.55, siehe methodology.md): min=0.491
  mid=5.099 max=6.935 Wh / 1.000 Output-Token.
- **Stand vor v0.3** (alte, symmetrische Default-PUE 1.4 ± 0.1): min=0.557
  mid=4.923 max=6.712 Wh / 1.000 Output-Token.

Kernaussage unverändert: die große Spanne zwischen min (~0.5) und max
(~6.9, Faktor ~13-14) wird nicht vom PUE-Wechsel dominiert, sondern vom
Cache-Read-Intervall (Faktor 0 vs. 0.1 auf `cacheReadTokens`, die bei
Claude-Code-Sitzungen den weit größten Anteil der Input-Token
ausmachen) - die PUE-Änderung verschiebt min/mid/max jeweils nur um
niedrige zweistellige bzw. einstellige Prozentpunkte (min -12 %, mid
+3.6 %, max +3.3 %), nicht um eine Größenordnung.

## Bekannte Einschränkungen

- **Cache-Read-Faktor ist ein Preis-Proxy, keine Energiemessung**:
  `cache-read-compute-share-anthropic` (0.1) stammt aus Anthropics
  Preisliste für Cache-Reads, nicht aus einer Energiemessung. Der
  tatsächliche Rechen-/Energieanteil eines Cache-Reads kann davon
  abweichen (in beide Richtungen) und ist zudem anbieterspezifisch - der
  Faktor gilt so nur für Anthropic-Modelle.
- **Energie pro Ausgabe-Token aus Kurzkontext-Benchmarks**: Die
  Energie-Koeffizienten in `data/facts.json`/`data/assumptions.json`
  sind seit der Umstellung auf Wh pro 1.000 Output-Token direkt an die
  mittlere Output-Tokenzahl der jeweiligen Benchmark-Messung gekoppelt
  (`src/resolve.ts:OUTPUT_TOKENS_FOR_ENERGY_FACT`, u.a. Oviedo et al.
  2025, arXiv:2509.20241) statt an eine einzelne pauschale
  Referenz-Tokenzahl. Die zugrunde liegenden Benchmarks selbst sind aber
  weiterhin Kurzkontext-Messungen (typische Werte 300-390 Output-Token,
  bei Reasoning-Modellen 5.000). Claude-Code-Nachrichten tragen oft
  zehntausende Kontext-Token (System-Prompt, Tool-Definitionen, bisherige
  Konversation) - die tatsächliche Rechenlast pro Ausgabe-Token steigt
  mit der Kontextlänge (längere Attention-Berechnung), was die
  bestehenden Koeffizienten für lange Kontexte weiterhin systematisch
  unterschätzen dürfte.
