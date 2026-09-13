# Methodik (Entwurf)

Dieses Dokument beschreibt den Rechenweg von ThirstyAI, alle eigenen
Annahmen (nicht durch die Faktendatei belegt) und die noch offenen
methodischen Lücken. Es ersetzt keine Quellenprüfung im Einzelfall -
dafür stehen `factIds` im Ergebnis und `data/facts.json`.

## Rechenweg

Eingabe: Modellname, optional Provider und Region, Anzahl Input- und
Output-Token, optional ein Stichtag (`asOf`).

1. **Koeffizienten auflösen** (`src/resolve.ts`): Modellklasse
   (small/mid/frontier/reasoning) aus dem Modellnamen ableiten, dazu
   fünf Bandbreiten mit Quellenangabe: Energie pro Anfrage (GPU-only,
   oder bei Gemini Apps bereits Vollstack), Overhead-Faktor (GPU zu
   IT-Energie), PUE, WUE (Standort-Kühlwasser) und EWIF
   (Wasser der Stromerzeugung) plus CO2-Faktor des Stromnetzes.
2. **Auf Tokenzahl skalieren**: Die Energie-Koeffizienten sind in Wh pro
   1.000 Output-Token angegeben, umgerechnet aus dem ursprünglichen
   Wh-pro-Anfrage-Fakt und der mittleren Output-Tokenzahl der jeweiligen
   Benchmark-Messung (`src/resolve.ts:OUTPUT_TOKENS_FOR_ENERGY_FACT`,
   siehe offene Stelle 1). Input-Token zählen zu 10 % wie ein
   Output-Token (Prefill ist billiger als Decoding, siehe Annahmen
   unten). `effectiveTokens = tokensOut + 0.1 * tokensIn`, skaliert
   linear mit `effectiveTokens / 1000`.
3. **energyGpu -> energyIt**: Bei Vollstack-Fakten (aktuell nur Gemini
   Apps) ist der Ausgangswert bereits die Gesamtenergie inklusive PUE;
   `energyIt` wird durch Teilen durch PUE zurückgerechnet. Sonst wird
   mit dem Overhead-Faktor (Annahme, 1.7-2.4x) multipliziert, um von
   reiner GPU-Energie auf die volle IT-Energie (inkl. Host, Idle,
   Netzwerk) zu kommen.
4. **energyTotal**: `energyIt * PUE` - bei Vollstack ergibt das exakt
   wieder `energyGpu` (Rundreise), da PUE dort schon eingerechnet war.
5. **waterScope1**: `energyIt * WUE` - Verdunstung am Standort, bezogen
   auf die IT-Energie (nicht auf den PUE-Overhead, der z.B. auch
   Kühlpumpen selbst umfasst).
6. **waterScope2**: `energyTotal * EWIF` - Wasser, das bei der
   Stromerzeugung für die gesamte Anlage verbraucht wird.
7. **co2Scope2**: `energyTotal * Emissionsfaktor / 1000` - Emissionen
   des Stromverbrauchs (location-/market-based, je nach Fakt).
   Herstellung der Hardware (Scope 3) und Kältemittel (Scope 1) sind
   nicht enthalten, siehe offene Stelle 3.

### CO2-Intensität nach Region

`resolveCarbonIntensity` (`src/resolve.ts:CARBON_REGION_TABLE_BY_YEAR`)
löst min/mid/max je Region für ein gegebenes Bezugsjahr auf (aktuell
ist nur 2024 hinterlegt): **mid** ist die nationale Referenzquelle, wo
es eine gibt (UBA für DE, RTE für FR, EMA für SG, eGRID für US),
sonst Ember. **min/max** sind der kleinste/größte Wert unter den
anerkannten 2024-Quellen (EEA, Ember, die nationale Referenz)
einschließlich mid selbst - das Intervall bildet also die Spreizung
*zwischen unabhängigen Quellen-Methoden* ab, nicht Messunsicherheit
innerhalb einer Quelle. Regionen ohne zweite, unabhängige 2024-Quelle
(IN, JP - hier liegt nur Ember vor) haben min = mid = max. Die
2023-Ausgabe von eGRID (`grid-co2-egrid-us-2023`) dient als
US-2024-Referenz, da sie weiterhin die aktuellste eGRID-Ausgabe ist.
Google ist die eine Ausnahme: es nutzt Googles eigenen, flottenweiten,
market-based Emissionsfaktor (`google-ef-mb-2024`) statt der
Regionstabelle, da Gemini Apps über die globale Flotte bedient wird,
nicht über eine feste Region.

**referenceYear**: ein optionaler Parameter (`calculate`/
`resolveCoefficients`, Default `DEFAULT_REFERENCE_YEAR` = 2024), der
festlegt, welche Jahres-Regionstabelle verwendet wird; er wird zusätzlich
im Ergebnis zurückgegeben, damit erkennbar bleibt, auf welchem
Jahrgang der Netzdaten eine Zahl beruht. Ein unbekanntes Bezugsjahr
(kein Eintrag in `CARBON_REGION_TABLE_BY_YEAR`) wirft einen Fehler,
statt still zurückzufallen. 2025er CO2-Intensitäts-Fakten (Ember 2025,
siehe v0.3-Addendum) liegen bereits in `data/facts.json` vor, werden
aber bewusst noch von keinem Regionstabellen-Eintrag referenziert: eine
2025-Tabelle bräuchte die 2025-Ausgaben sowohl von EEA als auch eGRID,
um die min/max-Methodenspreizungslogik konsistent zu halten, und keine
von beiden ist bisher verfügbar.

Alle Schritte sind Multiplikation oder Division durch positive Werte,
nie Subtraktion. Wendet man auf jeden Schritt konsequent die min- bzw.
max-Ausprägung jedes Koeffizienten an (bei Division über Kreuz: der
kleinste Quotient entsteht beim größten Divisor), bleibt
min <= mid <= max in jedem Ergebnisfeld automatisch erhalten.

**Confidence**: das Minimum der confidence-Werte aller tatsächlich
verwendeten Koeffizienten - mit einer Ausnahme, siehe Regel unten.
Bedingte Annahmen und Fallbacks (der Overhead-Faktor bei Nicht-Vollstack,
die WUE-Entnahme-zu-Verbrauch-Annahme bei AWS/Meta, die
WUE-Fallback-Grenzen ohne bekannten Anbieter, die Klassen-Energiewerte
je nach Modellklasse, der confidence-Deckel bei unbekannter Region)
zählen mit, weil sie nur einen Teil der Berechnungen betreffen und
damit echt zwischen gut und schwach belegten Fällen unterscheiden.

**Regel für universelle Annahmen**: Eine Annahme, die ausnahmslos in
*jede* Berechnung eingeht - unabhängig von Modell, Anbieter, Region
oder Vollstack/GPU-only-Pfad -, fließt nicht in die confidence ein.
Würde sie mitgezählt, wäre die confidence jedes Ergebnisses immer
auf ihren (typischerweise niedrigen) Wert begrenzt, egal wie gut die
übrigen, tatsächlich unterscheidenden Koeffizienten belegt sind - die
Kennzahl wäre dann nur noch dieser einen Konstante gleich und könnte
nicht mehr zwischen gut und schwach belegten Berechnungen
unterscheiden. Betroffen sind aktuell zwei Fakten:

- `input-token-cost-share` (Input-Kostenanteil, calculate.ts)
- `pue-range-half-width` (PUE-Bandbreite, resolve.ts) - gilt für jede
  einzige PUE-Auflösung, unabhängig vom Anbieter

Die früher hier geführte pauschale Referenz-Tokenzahl
(`reference-output-tokens`, 300 Token für jede Berechnung) ist keine
universelle Annahme mehr: die Skalierung erfolgt jetzt je Energie-Fakt
über `OUTPUT_TOKENS_FOR_ENERGY_FACT` (`src/resolve.ts`), und deren
Unsicherheit fließt - anders als vorher - in die normale
confidence-Berechnung ein (siehe offene Stelle 1).

Das ist ein bewusster Kompromiss, keine Verschleierung: beide
verbleibenden Fakten stehen weiterhin in `assumptions`, ihre
Unsicherheit bleibt also sichtbar - sie beeinflusst nur nicht die
confidence-Zahl. Leserinnen und Leser sollten confidence deshalb als
"bedingt auf Akzeptanz dieser zwei universellen Annahmen" lesen, nicht
als absolutes Maß an Sicherheit.

## Eigene Annahmen (`data/assumptions.json`)

Alle mit `rating: "ANNAHME"`, `confidence: 1`, `source_id:
"A-THIRSTYAI"`:

- **energy-small-lower-bound** (0.01 Wh): grobe untere Grenze für
  kleine Modelle, ohne eigene Messung.
- **overhead-factor-min/mid/max** (1.7 / 2.0 / 2.4): Spanne
  GPU-zu-IT-Energie, angelehnt an MIT Technology Review und das
  Verhältnis von Googles Vollstack- zu enger Systemgrenze.
- **reference-output-tokens** (300 Token): entfernt in 2026-09-08, ersetzt
  durch per-Fakt-Token-Bezug (`OUTPUT_TOKENS_FOR_ENERGY_FACT`,
  `src/resolve.ts`), siehe offene Stelle 1.
- **input-token-cost-share** (0.1): siehe offene Stelle 2.
- **frontier-class-joule-median** (0.39 Wh), **frontier-class-joule-iqr-max**
  (0.68 Wh): Zahlen, die nur im `second_source`-Feld eines Fakts standen
  (Joule-Monte-Carlo-Schätzung), hier als eigene, referenzierte ANNAHME
  herausgezogen, damit resolve.ts keine Zahlen-Literale enthält.
- **pue-range-half-width** (0.1): eigene Bandbreite um den PUE-Punktwert,
  da Anbieter PUE meist ohne Unsicherheitsangabe berichten. Seit Zyklus C
  wird diese Bandbreite je nach Anbieter unterschiedlich verwendet: für
  Google (`google-pue`) und Microsoft (`msft-pue-global-fy25`) gilt sie
  weiterhin symmetrisch, ± dieser Wert um den jeweils berichteten
  Punktwert. Für den Default-Anbieter (weder Google noch Microsoft) gibt
  es keinen einzelnen Punktwert mehr - min ist der Fakt
  `us-dc-pue-ai-2024` (1.145, PUE von US-Einrichtungen mit
  KI-Ausrüstung), mid ist `us-dc-pue-2024` (1.45, US-Landesdurchschnitt);
  nur die Obergrenze bleibt eine Annahme, `mid + pue-range-half-width`
  (1.55). Der ältere Fakt `us-dc-pue-2023` (1.40) bleibt als
  historischer Wert in `data/facts.json` erhalten, wird aber von
  `resolvePue` nicht mehr referenziert.
- **withdrawal-to-consumption-share** (0.8): aus der Notiz von
  `google-wue-cat2` ("Google verbraucht im Schnitt 80 % des entnommenen
  Wassers"), auf AWS und Meta übertragen.
- **wue-site-fallback-min/max** (0.32 / 0.4 L/kWh): Hyperscale-Median bzw.
  Sensitivität aus der Notiz von `us-dc-wue-site-2023`.
- **region-fallback-confidence-cap** (2): redaktionelle Regel, die die
  confidence deckelt, wenn bei unbekannter Region auf US-Werte
  zurückgefallen wird.

## Gegenprobe gegen EcoLogits

Ausführliche Tabellen: [docs/crosscheck/results.md](crosscheck/results.md).
EcoLogits (Python, GenAI Impact, JOSS 2025) wurde offline für dieselben
zehn Fälle (fünf Modellfamilien, kurz/lang) berechnet, ohne unsere
Koeffizienten daran anzupassen. Drei Erkenntnisse:

1. **Bei einem echten, offenen Modell mit bekannter Parameterzahl
   (Llama-3.1-70B-Instruct) stimmen beide Systeme auf 40 % genau
   überein**, obwohl sie methodisch komplett unabhängig sind
   (EcoLogits: Parameter-Regression; ThirstyAI: Benchmark-Fakten). Das
   ist die stärkste externe Bestätigung, die ThirstyAI bisher hat.
2. **Bei allen vier proprietären Modellen weichen die Werte um den
   Faktor 3-6 ab, in beide Richtungen** - nicht weil eines der Systeme
   falsch rechnet, sondern weil EcoLogits die Parameterzahl geschlossener
   Modelle selbst schätzen muss (z.B. gemini-2.5-pro: 200-600 Mrd.
   aktive Parameter, mit den Warnhinweisen `model-arch-not-released` und
   `model-arch-multimodal` versehen) und seine GPU-Energie linear mit
   dieser Schätzung skaliert, während ThirstyAI an gemessene
   Benchmark-Bandbreiten aus der Faktendatei gebunden bleibt.
3. **ThirstyAIs Namensheuristik hatte eine dokumentierte Schwäche**
   (behoben in Schritt 8, siehe Nachtrag): bei mistral-large-latest (real
   123 Mrd. Parameter, laut EcoLogits/Mistral selbst - passt in
   ThirstyAIs eigene 'mid'-Grenze von <=200 Mrd.) führte der
   Namensbestandteil "large" ohne begleitende Zahl zur falschen
   Einordnung als "frontier" (verankert an einem 405-Mrd.-Modell). Ein
   Modellname mit expliziter Größenangabe (wie "70b" bei Llama) war
   davon nicht betroffen.

**Nachtrag Schritt 7**: `data/models.json` gibt ThirstyAI seither
bekannte Parameterzahlen (Mistral Large 2, Llama 3.1 8B/70B/405B,
Mixtral 8x22B, DeepSeek-V3), die vor der Namensheuristik geprüft
werden. Der exakte Name "mistral-large-2" wurde dadurch korrekt als
"mid" erkannt (Test in `test/models.test.ts`) - Befund 3 blieb aber für
den in der Gegenprobe verwendeten Alias "mistral-large-latest" zunächst
bestehen, weil der Fakt auf das Token "2" angewiesen war und eine
Alias-Auflösung für "-latest"-Namen nicht Teil von Schritt 7 war.
Klarstellung zum Gemini-Fall: Googles selbst gemessener, bereits
vollständiger Vollstack-Wert (Fakt `gemini-energy`) gilt in ThirstyAI
nur für den Modellnamen "gemini-apps" (der Vollstack-Sonderfall aus
Testfall 1, Schritt 4). Der in der Gegenprobe verwendete Name
"gemini-2.5-pro" ist davon nicht betroffen: er läuft über die normale
"frontier"-Klasse (Monte-Carlo-Schätzung für Llama-3.1-405B), also
schätzt ThirstyAI hier genauso wie EcoLogits (das seinerseits 200-600
Mrd. aktive, nicht von Google bestätigte Parameter annimmt) - der
Gemini-Befund oben (2.) ist eine Schätzung-gegen-Schätzung-Abweichung,
kein Vergleich zwischen einem gemessenen und einem geschätzten Wert.

**Nachtrag Schritt 8**: `data/models.json`-Fakten tragen jetzt ein
`aliases`-Feld (über die ganze Tabelle eindeutig geprüft beim Laden).
`classifyModel` löst in drei Stufen auf: exakter Fakt-Name, dann Alias,
erst dann die Namensheuristik. "mistral-large-latest" ist als Alias von
`params-mistral-large-2` hinterlegt und wird dadurch korrekt als "mid"
klassifiziert - Befund 3 ist damit für die Gegenprobe behoben (siehe
aktualisierte results.md, mistral-Zeilen jetzt innerhalb von 25 % statt
Faktor 6-8). Außerdem wurde die confidence-Staffelung der
Namensheuristik verfeinert: Fakt-basierte Treffer übernehmen die
confidence des Fakts, ein Namenstreffer mit erkannter Familie UND
Größen-/Verhaltensmarker (z.B. "mini", "70b", "r1") ergibt confidence
2, eine erkannte Familie ohne Marker oder ein komplett unbekannter Name
ergeben beide confidence 1 (vorher: 2 bzw. 1) - eine Familie allein ist
keine verlässliche Größenaussage. Betroffener Test:
"fällt bei bekannter Familie ohne Größenhinweis auf frontier mit
confidence 2 zurück" in `test/models.test.ts`, jetzt confidence 1.

## Offene Stellen

1. **Token-Zuordnung für die Skalierung**: Jeder Energie-Fakt wird über
   `OUTPUT_TOKENS_FOR_ENERGY_FACT` (`src/resolve.ts`) einem Token-Fakt
   zugeordnet, der die zugehörige mittlere Output-Tokenzahl liefert.
   Bei `basis: "measured"` (z.B. `llama31-70b-inf-energy` ->
   `mlenergy-llama31-70b-output-tokens`) stammen Energie- und Tokenwert
   aus derselben Messung/demselben Benchmark. Bei `basis: "assumed"`
   (u.a. alle Fälle, die einer Oviedo-Typwertannahme wie
   `oviedo-typical-output-tokens` zugeordnet sind, darunter auch der
   Vollstack-Fakt `gemini-energy`) wird eine Tokenzahl aus einer anderen
   Quelle übernommen; die confidence wird in diesen Fällen zusätzlich
   auf 2 gedeckelt (`perThousandOutputTokens()`). Das löst die früher
   hier dokumentierte pauschale Referenz-Tokenzahl (300, für jede
   Berechnung dieselbe) ab, bleibt aber für `basis: "assumed"`-Fälle
   ein ähnliches methodisches Risiko: die zugeordnete Tokenzahl misst
   nicht dieselbe Anfrage wie der Energiewert.
2. **Input-Kostenanteil (0.1)**: Dass ein Input-Token energetisch wie
   0.1 Output-Token zählt, ist eine Annahme (Prefill ist parallelisierbar
   und damit billiger als sequentielles Decoding), aber mit den
   vorliegenden Fakten nicht quantifiziert.
3. **co2Scope2 deckt nicht Googles gesamte, öffentlich genannte
   CO2-Zahl ab**: Für die Gemini-Fallstudie nennt Google 0.03 g CO2e
   pro medianem Text-Prompt (Fakt `gemini-co2`). Diese Zahl umfasst laut
   Anmerkung des Fakts auch Scope 1 (Kältemittel) und Scope 3
   (Hardware-Herstellung), zusammen rund 0.010 g. Die hier dokumentierte
   Formel (Energie x Netz-Emissionsfaktor) kann rechnerisch nur den
   Scope-2-Anteil abbilden (rund 0.023 g). ThirstyAI berechnet deshalb
   bewusst nur `co2Scope2` und benennt das im Feldnamen und im
   Typkommentar, statt eine nicht herleitbare Gesamtzahl zu behaupten
   oder den Umfang des Projekts um eine Lebenszyklusanalyse zu
   erweitern (siehe Projektregel "keine Scope-Erweiterung"). Ergebnisse
   von ThirstyAI unterschätzen die tatsächliche CO2-Gesamtbilanz
   entsprechend um den Scope-1+3-Anteil.
4. **Modellklasse "small" ist nur eine grobe Untergrenze**:
   `energy-small-lower-bound` (0.01 Wh) ist eine ANNAHME ohne eigene
   Messung, `dsr1-distill-70b-noreason` (0.0495 Wh) dient nur als
   konservative Obergrenze - dazwischen liegt keine belegte Bandbreite.
   In der Gegenprobe (docs/crosscheck/results.md) fällt das auf:
   gpt-4o-mini liegt bei ThirstyAI durchgehend um Faktor 4 höher als bei
   EcoLogits, obwohl beide Werkzeuge das Modell in dieselbe kleinste
   Größenklasse einordnen - der Unterschied liegt an der Berechnung
   selbst (ThirstyAIs Overhead-Faktor ohne Parallelitäts-/Batching-Modell
   vs. EcoLogits' Regression mit batch_size=64), nicht an der
   Modellklasse, aber die dünne Faktenlage der Klasse "small" macht eine
   unabhängige Prüfung schwer.
