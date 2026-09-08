# Methodik (Entwurf)

Dieses Dokument beschreibt den Rechenweg von ThirstyAI, alle eigenen
Annahmen (nicht durch die Faktendatei belegt) und die noch offenen
methodischen Luecken. Es ersetzt keine Quellenpruefung im Einzelfall -
dafuer stehen `factIds` im Ergebnis und `data/facts.json`.

## Rechenweg

Eingabe: Modellname, optional Provider und Region, Anzahl Input- und
Output-Token, optional ein Stichtag (`asOf`).

1. **Koeffizienten aufloesen** (`src/resolve.ts`): Modellklasse
   (small/mid/frontier/reasoning) aus dem Modellnamen ableiten, dazu
   fuenf Bandbreiten mit Quellenangabe: Energie pro Anfrage (GPU-only,
   oder bei Gemini Apps bereits Vollstack), Overhead-Faktor (GPU zu
   IT-Energie), PUE, WUE (Standort-Kuehlwasser) und EWIF
   (Wasser der Stromerzeugung) plus CO2-Faktor des Stromnetzes.
2. **Auf Tokenzahl skalieren**: Die Energie-Koeffizienten sind in Wh pro
   1.000 Output-Token angegeben, umgerechnet aus dem urspruenglichen
   Wh-pro-Anfrage-Fakt und der mittleren Output-Tokenzahl der jeweiligen
   Benchmark-Messung (`src/resolve.ts:OUTPUT_TOKENS_FOR_ENERGY_FACT`,
   siehe offene Stelle 1). Input-Token zaehlen zu 10 % wie ein
   Output-Token (Prefill ist billiger als Decoding, siehe Annahmen
   unten). `effectiveTokens = tokensOut + 0.1 * tokensIn`, skaliert
   linear mit `effectiveTokens / 1000`.
3. **energyGpu -> energyIt**: Bei Vollstack-Fakten (aktuell nur Gemini
   Apps) ist der Ausgangswert bereits die Gesamtenergie inklusive PUE;
   `energyIt` wird durch Teilen durch PUE zurueckgerechnet. Sonst wird
   mit dem Overhead-Faktor (Annahme, 1.7-2.4x) multipliziert, um von
   reiner GPU-Energie auf die volle IT-Energie (inkl. Host, Idle,
   Netzwerk) zu kommen.
4. **energyTotal**: `energyIt * PUE` - bei Vollstack ergibt das exakt
   wieder `energyGpu` (Rundreise), da PUE dort schon eingerechnet war.
5. **waterScope1**: `energyIt * WUE` - Verdunstung am Standort, bezogen
   auf die IT-Energie (nicht auf den PUE-Overhead, der z.B. auch
   Kuehlpumpen selbst umfasst).
6. **waterScope2**: `energyTotal * EWIF` - Wasser, das bei der
   Stromerzeugung fuer die gesamte Anlage verbraucht wird.
7. **co2Scope2**: `energyTotal * Emissionsfaktor / 1000` - Emissionen
   des Stromverbrauchs (location-/market-based, je nach Fakt).
   Herstellung der Hardware (Scope 3) und Kaeltemittel (Scope 1) sind
   nicht enthalten, siehe offene Stelle 3.

Alle Schritte sind Multiplikation oder Division durch positive Werte,
nie Subtraktion. Wendet man auf jeden Schritt konsequent die min- bzw.
max-Auspraegung jedes Koeffizienten an (bei Division ueber Kreuz: der
kleinste Quotient entsteht beim groessten Divisor), bleibt
min <= mid <= max in jedem Ergebnisfeld automatisch erhalten.

**Confidence**: das Minimum der confidence-Werte aller tatsaechlich
verwendeten Koeffizienten - mit einer Ausnahme, siehe Regel unten.
Bedingte Annahmen und Fallbacks (der Overhead-Faktor bei Nicht-Vollstack,
die WUE-Entnahme-zu-Verbrauch-Annahme bei AWS/Meta, die
WUE-Fallback-Grenzen ohne bekannten Anbieter, die Klassen-Energiewerte
je nach Modellklasse, der confidence-Deckel bei unbekannter Region)
zaehlen mit, weil sie nur einen Teil der Berechnungen betreffen und
damit echt zwischen gut und schwach belegten Faellen unterscheiden.

**Regel für universelle Annahmen**: Eine Annahme, die ausnahmslos in
*jede* Berechnung eingeht - unabhaengig von Modell, Anbieter, Region
oder Vollstack/GPU-only-Pfad -, fliesst nicht in die confidence ein.
Wuerde sie mitgezaehlt, waere die confidence jedes Ergebnisses immer
auf ihren (typischerweise niedrigen) Wert begrenzt, egal wie gut die
uebrigen, tatsaechlich unterscheidenden Koeffizienten belegt sind - die
Kennzahl waere dann nur noch dieser einen Konstante gleich und koennte
nicht mehr zwischen gut und schwach belegten Berechnungen
unterscheiden. Betroffen sind aktuell zwei Fakten:

- `input-token-cost-share` (Input-Kostenanteil, calculate.ts)
- `pue-range-half-width` (PUE-Bandbreite, resolve.ts) - gilt fuer jede
  einzige PUE-Aufloesung, unabhaengig vom Anbieter

Die frueher hier gefuehrte pauschale Referenz-Tokenzahl
(`reference-output-tokens`, 300 Token fuer jede Berechnung) ist keine
universelle Annahme mehr: die Skalierung erfolgt jetzt je Energie-Fakt
ueber `OUTPUT_TOKENS_FOR_ENERGY_FACT` (`src/resolve.ts`), und deren
Unsicherheit fliesst - anders als vorher - in die normale
confidence-Berechnung ein (siehe offene Stelle 1).

Das ist ein bewusster Kompromiss, keine Verschleierung: beide
verbleibenden Fakten stehen weiterhin in `assumptions`, ihre
Unsicherheit bleibt also sichtbar - sie beeinflusst nur nicht die
confidence-Zahl. Leserinnen und Leser sollten confidence deshalb als
"bedingt auf Akzeptanz dieser zwei universellen Annahmen" lesen, nicht
als absolutes Mass an Sicherheit.

## Eigene Annahmen (`data/assumptions.json`)

Alle mit `rating: "ANNAHME"`, `confidence: 1`, `source_id:
"A-THIRSTYAI"`:

- **energy-small-lower-bound** (0.01 Wh): grobe untere Grenze fuer
  kleine Modelle, ohne eigene Messung.
- **overhead-factor-min/mid/max** (1.7 / 2.0 / 2.4): Spanne
  GPU-zu-IT-Energie, angelehnt an MIT Technology Review und das
  Verhaeltnis von Googles Vollstack- zu enger Systemgrenze.
- **reference-output-tokens** (300 Token): entfernt in 2026-09-08, ersetzt
  durch per-Fakt-Token-Bezug (`OUTPUT_TOKENS_FOR_ENERGY_FACT`,
  `src/resolve.ts`), siehe offene Stelle 1.
- **input-token-cost-share** (0.1): siehe offene Stelle 2.
- **frontier-class-joule-median** (0.39 Wh), **frontier-class-joule-iqr-max**
  (0.68 Wh): Zahlen, die nur im `second_source`-Feld eines Fakts standen
  (Joule-Monte-Carlo-Schaetzung), hier als eigene, referenzierte ANNAHME
  herausgezogen, damit resolve.ts keine Zahlen-Literale enthaelt.
- **pue-range-half-width** (0.1): eigene Bandbreite um den PUE-Punktwert,
  da Anbieter PUE meist ohne Unsicherheitsangabe berichten.
- **withdrawal-to-consumption-share** (0.8): aus der Notiz von
  `google-wue-cat2` ("Google verbraucht im Schnitt 80 % des entnommenen
  Wassers"), auf AWS und Meta uebertragen.
- **wue-site-fallback-min/max** (0.32 / 0.4 L/kWh): Hyperscale-Median bzw.
  Sensitivitaet aus der Notiz von `us-dc-wue-site-2023`.
- **region-fallback-confidence-cap** (2): redaktionelle Regel, die die
  confidence deckelt, wenn bei unbekannter Region auf US-Werte
  zurueckgefallen wird.

## Gegenprobe gegen EcoLogits

Ausfuehrliche Tabellen: [docs/crosscheck/results.md](crosscheck/results.md).
EcoLogits (Python, GenAI Impact, JOSS 2025) wurde offline fuer dieselben
zehn Faelle (fuenf Modellfamilien, kurz/lang) berechnet, ohne unsere
Koeffizienten daran anzupassen. Drei Erkenntnisse:

1. **Bei einem echten, offenen Modell mit bekannter Parameterzahl
   (Llama-3.1-70B-Instruct) stimmen beide Systeme auf 40 % genau
   ueberein**, obwohl sie methodisch komplett unabhaengig sind
   (EcoLogits: Parameter-Regression; ThirstyAI: Benchmark-Fakten). Das
   ist die staerkste externe Bestaetigung, die ThirstyAI bisher hat.
2. **Bei allen vier proprietaeren Modellen weichen die Werte um den
   Faktor 3-6 ab, in beide Richtungen** - nicht weil eines der Systeme
   falsch rechnet, sondern weil EcoLogits die Parameterzahl geschlossener
   Modelle selbst schaetzen muss (z.B. gemini-2.5-pro: 200-600 Mrd.
   aktive Parameter, mit den Warnhinweisen `model-arch-not-released` und
   `model-arch-multimodal` versehen) und seine GPU-Energie linear mit
   dieser Schaetzung skaliert, waehrend ThirstyAI an gemessene
   Benchmark-Bandbreiten aus der Faktendatei gebunden bleibt.
3. **ThirstyAIs Namensheuristik hatte eine dokumentierte Schwaeche**
   (behoben in Schritt 8, siehe Nachtrag): bei mistral-large-latest (real
   123 Mrd. Parameter, laut EcoLogits/Mistral selbst - passt in
   ThirstyAIs eigene 'mid'-Grenze von <=200 Mrd.) fuehrte der
   Namensbestandteil "large" ohne begleitende Zahl zur falschen
   Einordnung als "frontier" (verankert an einem 405-Mrd.-Modell). Ein
   Modellname mit expliziter Groessenangabe (wie "70b" bei Llama) war
   davon nicht betroffen.

**Nachtrag Schritt 7**: `data/models.json` gibt ThirstyAI seither
bekannte Parameterzahlen (Mistral Large 2, Llama 3.1 8B/70B/405B,
Mixtral 8x22B, DeepSeek-V3), die vor der Namensheuristik geprueft
werden. Der exakte Name "mistral-large-2" wurde dadurch korrekt als
"mid" erkannt (Test in `test/models.test.ts`) - Befund 3 blieb aber fuer
den in der Gegenprobe verwendeten Alias "mistral-large-latest" zunaechst
bestehen, weil der Fakt auf das Token "2" angewiesen war und eine
Alias-Aufloesung fuer "-latest"-Namen nicht Teil von Schritt 7 war.
Klarstellung zum Gemini-Fall: Googles selbst gemessener, bereits
vollstaendiger Vollstack-Wert (Fakt `gemini-energy`) gilt in ThirstyAI
nur fuer den Modellnamen "gemini-apps" (der Vollstack-Sonderfall aus
Testfall 1, Schritt 4). Der in der Gegenprobe verwendete Name
"gemini-2.5-pro" ist davon nicht betroffen: er laeuft ueber die normale
"frontier"-Klasse (Monte-Carlo-Schaetzung fuer Llama-3.1-405B), also
schaetzt ThirstyAI hier genauso wie EcoLogits (das seinerseits 200-600
Mrd. aktive, nicht von Google bestaetigte Parameter annimmt) - der
Gemini-Befund oben (2.) ist eine Schaetzung-gegen-Schaetzung-Abweichung,
kein Vergleich zwischen einem gemessenen und einem geschaetzten Wert.

**Nachtrag Schritt 8**: `data/models.json`-Fakten tragen jetzt ein
`aliases`-Feld (ueber die ganze Tabelle eindeutig geprueft beim Laden).
`classifyModel` loest in drei Stufen auf: exakter Fakt-Name, dann Alias,
erst dann die Namensheuristik. "mistral-large-latest" ist als Alias von
`params-mistral-large-2` hinterlegt und wird dadurch korrekt als "mid"
klassifiziert - Befund 3 ist damit fuer die Gegenprobe behoben (siehe
aktualisierte results.md, mistral-Zeilen jetzt innerhalb von 25 % statt
Faktor 6-8). Ausserdem wurde die confidence-Staffelung der
Namensheuristik verfeinert: Fakt-basierte Treffer uebernehmen die
confidence des Fakts, ein Namenstreffer mit erkannter Familie UND
Groessen-/Verhaltensmarker (z.B. "mini", "70b", "r1") ergibt confidence
2, eine erkannte Familie ohne Marker oder ein komplett unbekannter Name
ergeben beide confidence 1 (vorher: 2 bzw. 1) - eine Familie allein ist
keine verlaessliche Groessenaussage. Betroffener Test:
"faellt bei bekannter Familie ohne Groessenhinweis auf frontier mit
confidence 2 zurueck" in `test/models.test.ts`, jetzt confidence 1.

## Offene Stellen

1. **Token-Zuordnung fuer die Skalierung**: Jeder Energie-Fakt wird ueber
   `OUTPUT_TOKENS_FOR_ENERGY_FACT` (`src/resolve.ts`) einem Token-Fakt
   zugeordnet, der die zugehoerige mittlere Output-Tokenzahl liefert.
   Bei `basis: "measured"` (z.B. `llama31-70b-inf-energy` ->
   `mlenergy-llama31-70b-output-tokens`) stammen Energie- und Tokenwert
   aus derselben Messung/demselben Benchmark. Bei `basis: "assumed"`
   (u.a. alle Faelle, die einer Oviedo-Typwertannahme wie
   `oviedo-typical-output-tokens` zugeordnet sind, darunter auch der
   Vollstack-Fakt `gemini-energy`) wird eine Tokenzahl aus einer anderen
   Quelle uebernommen; die confidence wird in diesen Faellen zusaetzlich
   auf 2 gedeckelt (`perThousandOutputTokens()`). Das loest die frueher
   hier dokumentierte pauschale Referenz-Tokenzahl (300, fuer jede
   Berechnung dieselbe) ab, bleibt aber fuer `basis: "assumed"`-Faelle
   ein aehnliches methodisches Risiko: die zugeordnete Tokenzahl misst
   nicht dieselbe Anfrage wie der Energiewert.
2. **Input-Kostenanteil (0.1)**: Dass ein Input-Token energetisch wie
   0.1 Output-Token zaehlt, ist eine Annahme (Prefill ist parallelisierbar
   und damit billiger als sequentielles Decoding), aber mit den
   vorliegenden Fakten nicht quantifiziert.
3. **co2Scope2 deckt nicht Googles gesamte, oeffentlich genannte
   CO2-Zahl ab**: Fuer die Gemini-Fallstudie nennt Google 0.03 g CO2e
   pro medianem Text-Prompt (Fakt `gemini-co2`). Diese Zahl umfasst laut
   Anmerkung des Fakts auch Scope 1 (Kaeltemittel) und Scope 3
   (Hardware-Herstellung), zusammen rund 0.010 g. Die hier dokumentierte
   Formel (Energie x Netz-Emissionsfaktor) kann rechnerisch nur den
   Scope-2-Anteil abbilden (rund 0.023 g). ThirstyAI berechnet deshalb
   bewusst nur `co2Scope2` und benennt das im Feldnamen und im
   Typkommentar, statt eine nicht herleitbare Gesamtzahl zu behaupten
   oder den Umfang des Projekts um eine Lebenszyklusanalyse zu
   erweitern (siehe Projektregel "keine Scope-Erweiterung"). Ergebnisse
   von ThirstyAI unterschaetzen die tatsaechliche CO2-Gesamtbilanz
   entsprechend um den Scope-1+3-Anteil.
4. **Modellklasse "small" ist nur eine grobe Untergrenze**:
   `energy-small-lower-bound` (0.01 Wh) ist eine ANNAHME ohne eigene
   Messung, `dsr1-distill-70b-noreason` (0.0495 Wh) dient nur als
   konservative Obergrenze - dazwischen liegt keine belegte Bandbreite.
   In der Gegenprobe (docs/crosscheck/results.md) faellt das auf:
   gpt-4o-mini liegt bei ThirstyAI durchgehend um Faktor 4 hoeher als bei
   EcoLogits, obwohl beide Werkzeuge das Modell in dieselbe kleinste
   Groessenklasse einordnen - der Unterschied liegt an der Berechnung
   selbst (ThirstyAIs Overhead-Faktor ohne Parallelitaets-/Batching-Modell
   vs. EcoLogits' Regression mit batch_size=64), nicht an der
   Modellklasse, aber die duenne Faktenlage der Klasse "small" macht eine
   unabhaengige Pruefung schwer.
