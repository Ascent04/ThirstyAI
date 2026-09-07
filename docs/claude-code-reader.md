# Claude-Code-Sitzungsprotokoll-Leser

`src/readers/claudeCode.ts` liest ein Claude-Code-Sitzungsprotokoll
(JSONL) und liefert rohe Zaehlwerte pro Nachricht. Interner Baustein,
nicht ueber `src/index.ts` exportiert. `examples/claude-code-session.ts`
zeigt, wie daraus eine Messung durch `calculate` wird (Kopie der
Sitzungsdatei nach `/tmp`, Aggregation pro Modell, zwei `calculate()`-
Aufrufe mit min/max-tokensIn, aeussere Grenzen der Ergebnis-Intervalle
zusammengefuehrt).

## Datenschutz

Gelesen werden ausschliesslich Zaehlfelder: `timestamp`, `message.id`,
`message.model`, `message.usage.*`. `message.content` wird nie geparst
oder inspiziert - keine Nachrichteninhalte werden gelesen, ausgegeben
oder in Fixtures kopiert (Test-Fixtures enthalten ausschliesslich
erfundene Platzhaltertexte).

## Deduplizierung

Eine einzelne Anfrage kann sich ueber mehrere JSONL-Zeilen erstrecken
(ein Streaming-Chunk pro Content-Block), alle mit identischer
`message.usage`. Der Leser dedupliziert ueber `message.id` und behaelt
den Datensatz mit dem groessten `output_tokens`.

## Warum thinking_tokens nicht gelesen wird

Empirisch geprueft (153 Nachrichten mit einem `thinking`-Block):
`output_tokens` ist nie kleiner als `output_tokens_details.thinking_tokens`,
und beide korrelieren mit 0.977 ueber eine Spanne von 16 bis 38222 - das
Feld `output_tokens` schliesst `thinking_tokens` demnach ein. Ein
separates Auslesen von `thinking_tokens` ist fuer die Gesamtzaehlung
daher nicht noetig.

## Cache-Read-Intervall

`toInputTokenRange(record, cacheReadComputeShare)` behandelt Cache-Reads
als Intervall statt als festen Wert:

- **min** schliesst `cacheReadTokens` komplett aus - ein Cache-Treffer
  braucht im Idealfall keine erneute Verarbeitung.
- **max** gewichtet `cacheReadTokens` mit `cacheReadComputeShare`.
- `cacheCreationTokens` zaehlen in beiden Faellen voll, da sie in jedem
  Fall frisch verarbeitete Eingabe sind.

`cacheReadComputeShare` wird vom Aufrufer aus
`data/assumptions.json` geladen (Fakt `cache-read-compute-share-anthropic`,
value 0.1 - Anthropics eigenes Preisverhaeltnis fuer Cache-Reads, siehe
Fakt-Notiz und Quelle dort) und nicht in `claudeCode.ts` hart codiert.
Fruehere Fassung dieses Werkzeugs zaehlte Cache-Reads im Maximum wie
volle Input-Token (Faktor 1.0) - das ergab fuer stark gecachte Sitzungen
(siehe unten) eine Obergrenze um den Faktor 10 zu hoch.

## Bekannte Einschraenkungen

- **Cache-Read-Faktor ist ein Preis-Proxy, keine Energiemessung**:
  `cache-read-compute-share-anthropic` (0.1) stammt aus Anthropics
  Preisliste fuer Cache-Reads, nicht aus einer Energiemessung. Der
  tatsaechliche Rechen-/Energieanteil eines Cache-Reads kann davon
  abweichen (in beide Richtungen) und ist zudem anbieterspezifisch - der
  Faktor gilt so nur fuer Anthropic-Modelle.
- **Energie pro Ausgabe-Token aus Kurzkontext-Benchmarks**: die in
  `data/facts.json`/`data/assumptions.json` hinterlegten Energie-Koeffizienten
  stammen aus Benchmarks mit kurzen Prompts (siehe Referenz-Tokenzahl,
  300 Output-Token). Claude-Code-Nachrichten tragen oft zehntausende
  Kontext-Token (System-Prompt, Tool-Definitionen, bisherige
  Konversation) - die tatsaechliche Rechenlast pro Ausgabe-Token steigt
  mit der Kontextlaenge (laengere Attention-Berechnung), was die
  bestehenden Koeffizienten fuer lange Kontexte systematisch
  unterschaetzen duerfte.
