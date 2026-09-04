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
2. **Auf Tokenzahl skalieren**: Die Energie-Koeffizienten gelten fuer
   eine Referenzantwort von 300 Output-Token. Input-Token zaehlen zu
   10 % wie ein Output-Token (Prefill ist billiger als Decoding, siehe
   Annahmen unten). `effectiveTokens = tokensOut + 0.1 * tokensIn`,
   skaliert linear mit `effectiveTokens / 300`.
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
max-Auspraegung jedes Koeffizienten an, bleibt min <= mid <= max in
jedem Ergebnisfeld automatisch erhalten.

**Confidence**: das Minimum der confidence-Werte aller tatsaechlich
verwendeten Koeffizienten (der Overhead-Faktor zaehlt nur mit, wenn er
auch angewendet wird, also nicht bei Vollstack-Fakten). Die beiden
universellen Umrechnungs-Annahmen (Referenz-Tokenzahl,
Input-Kostenanteil) fliessen nicht in die confidence ein - sonst waere
jedes Ergebnis unabhaengig von der Qualitaet der uebrigen Fakten auf 1
begrenzt. Sie erscheinen aber in `assumptions`, damit sie sichtbar
bleiben.

## Eigene Annahmen (`data/assumptions.json`)

Alle mit `rating: "ANNAHME"`, `confidence: 1`, `source_id:
"A-THIRSTYAI"`:

- **energy-small-lower-bound** (0.01 Wh): grobe untere Grenze fuer
  kleine Modelle, ohne eigene Messung.
- **overhead-factor-min/mid/max** (1.7 / 2.0 / 2.4): Spanne
  GPU-zu-IT-Energie, angelehnt an MIT Technology Review und das
  Verhaeltnis von Googles Vollstack- zu enger Systemgrenze.
- **reference-output-tokens** (300 Token): siehe offene Stelle 1.
- **input-token-cost-share** (0.1): siehe offene Stelle 2.

## Offene Stellen

1. **Referenz-Tokenzahl (300)**: Die Energie-Benchmarks der
   Faktendatei geben Wh pro Anfrage an, aber meist ohne dokumentierte
   mittlere Antwortlaenge. 300 Output-Token ist eine plausible, aber
   nicht empirisch belegte Annahme fuer die Skalierung auf andere
   Tokenzahlen.
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
