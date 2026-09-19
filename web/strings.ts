export const EN = {
  infoExplanation: "Explanation",
  infoToggleGlyph: "?",
  decimalSeparator: ".",
  barNumbers: (min: string, mid: string, max: string) => `min ${min} · mid ${mid} · max ${max}`,
  boundaryFallback: "—",
  columnTipId: "Identifier in data/facts.json.",
  columnTipValue: "The number as recorded, with its unit.",
  columnTipRating: "Strength of evidence — see glossary.",
  columnTipConfidence: "How dependable this value is, 1 to 5.",
  columnTipMeasurementBoundary: "What this value includes and leaves out.",
  columnTipSource: "Where the value comes from.",
  columnId: "ID",
  columnValue: "Value",
  columnRating: "Rating",
  columnConfidence: "Confidence",
  columnMeasurementBoundary: "Measurement boundary",
  columnSource: "Source",
  otherUnknownModel: "Other / unknown model",
  amountTooLarge: "Value too large — the calculator is meant for up to 100 billion tokens.",
  unitWords: "words",
  unitOutputTokens: "output tokens",
  derivedTokens: (tokens: string, wordsToTokens: string) => `≈ ${tokens} output tokens, ×${wordsToTokens} assumption`,
  labelEnergy: "Energy",
  tipEnergy:
    "Electricity for one request, from the chip through the data " +
    "centre. Watt-hours: a 40-watt laptop running for one minute " +
    "uses about 0.7 Wh.",
  labelWater: "Water",
  tipWater:
    "Water evaporated for one request — cooling at the data centre " +
    "plus cooling at the power plants that supplied the electricity.",
  labelCo2: "CO2",
  tipCo2:
    "Carbon dioxide from generating the electricity for one request. " +
    "Location-based: the actual grid mix of the region, not green " +
    "power contracts.",
  rangeNote: "Range = spread between credible sources' methods, not instrument error.",
  dataConfidence: (n: string) => `Data confidence ${n}/5`,
  dataConfidenceTip:
    "The weakest evidenced source that went into this result, from 1 " +
    "to 5. It says how good the data is.",
  methodConfidence: (n: string) => `Method confidence ${n}/5`,
  methodConfidenceTip:
    "The weakest assumption that went into this result, from 1 to 5. " +
    "It says how sound the calculation is where no source exists.",
  measurementBoundaryLine: (boundary: string) => `Measurement boundary: ${boundary}`,
  measurementBoundaryTip:
    "How much of the system is counted. gpu-only means the figure " +
    "covers the chip and is scaled up to the data centre; fullstack " +
    "means it was measured across the whole stack.",
  operationOnlyNote:
    "Operation only. Training, hardware manufacturing and data centre " +
    "construction are not included — see the FAQ on system boundary.",
  methodConfidenceCappedNote:
    "Method confidence is capped at 1/5 by unverified assumptions (see " +
    "Assumptions below). Data confidence reflects the weakest measured " +
    "source actually used.",
  waterFallbackNote:
    "No grid water factor available for this region — the US average " +
    "is used as a fallback, and confidence is capped accordingly.",
  carbonFallbackNote:
    "No regional grid carbon factor available — the US average is " +
    "used as a fallback.",
  unknownModelHint: "Unknown model: conservative frontier-class estimate.",
  modelClassLine: (modelClass: string, factId: string) =>
    `Model class: ${modelClass} · classified via ${factId}`,
  modelClassTip:
    "The size class decides which energy measurements are used (small, mid, frontier or reasoning). " +
    "It follows from the fact named here, which is also listed in the tables below.",
  factsUsedTitle: "Facts used",
  factsUsedTip:
    "Every source that went into this result. Ratings and boundaries " +
    "are shown so the numbers can be checked.",
  assumptionsTitle: "Assumptions",
  assumptionsTip:
    "Values the project had to set itself because no source exists. " +
    "They are kept separate from evidenced facts on purpose.",
};

export type Strings = typeof EN;

export const DE: Strings = {
  infoExplanation: "Erklärung",
  infoToggleGlyph: "?",
  decimalSeparator: ",",
  barNumbers: (min, mid, max) => `min ${min} · mid ${mid} · max ${max}`,
  boundaryFallback: "—",
  columnTipId: "Kennung in data/facts.json.",
  columnTipValue: "Der Wert, wie er in der Quelle steht, mit Einheit.",
  columnTipRating: "Stärke der Belege — siehe Glossar.",
  columnTipConfidence: "Wie verlässlich dieser Wert ist, 1 bis 5.",
  columnTipMeasurementBoundary: "Was dieser Wert einschließt und was nicht.",
  columnTipSource: "Woher der Wert stammt.",
  columnId: "ID",
  columnValue: "Wert",
  columnRating: "Bewertung",
  columnConfidence: "Konfidenz",
  columnMeasurementBoundary: "Messgrenze",
  columnSource: "Quelle",
  otherUnknownModel: "Anderes / unbekanntes Modell",
  amountTooLarge: "Wert zu groß — der Rechner ist für bis zu 100 Milliarden Token gedacht.",
  unitWords: "Wörter",
  unitOutputTokens: "Output-Token",
  derivedTokens: (tokens, wordsToTokens) =>
    `≈ ${tokens} Output-Token, ×${wordsToTokens} Annahme`,
  labelEnergy: "Energie",
  tipEnergy:
    "Strom für eine Anfrage, vom Chip bis zum Rechenzentrum. Wattstunden: " +
    "ein 40-Watt-Laptop verbraucht in einer Minute etwa 0,7 Wh.",
  labelWater: "Wasser",
  tipWater:
    "Verdunstetes Wasser für eine Anfrage — Kühlung im Rechenzentrum plus " +
    "Kühlung in den Kraftwerken, die den Strom geliefert haben.",
  labelCo2: "CO2",
  tipCo2:
    "Kohlendioxid aus der Stromerzeugung für eine Anfrage. Location-based: " +
    "der tatsächliche Strommix der Region, keine Ökostromverträge.",
  rangeNote: "Spanne = Streuung zwischen den Methoden glaubwürdiger Quellen, kein Messfehler.",
  dataConfidence: (n) => `Datenkonfidenz ${n}/5`,
  dataConfidenceTip:
    "Die schwächste belegte Quelle, die in dieses Ergebnis eingeht, von 1 " +
    "bis 5. Sagt, wie gut die Daten sind.",
  methodConfidence: (n) => `Methodenkonfidenz ${n}/5`,
  methodConfidenceTip:
    "Die schwächste Annahme, die in dieses Ergebnis eingeht, von 1 bis 5. " +
    "Sagt, wie belastbar die Rechnung dort ist, wo keine Quelle existiert.",
  measurementBoundaryLine: (boundary) => `Messgrenze: ${boundary}`,
  measurementBoundaryTip:
    "Wie viel vom System mitgezählt wird. gpu-only heißt: die Zahl erfasst " +
    "den Chip und wird auf das Rechenzentrum hochgerechnet; fullstack heißt: " +
    "über den ganzen Stack gemessen.",
  operationOnlyNote:
    "Nur Betrieb. Training, Hardware-Herstellung und Bau des Rechenzentrums " +
    "sind nicht enthalten — siehe FAQ zur Systemgrenze.",
  methodConfidenceCappedNote:
    "Die Methodenkonfidenz ist durch ungeprüfte Annahmen auf 1/5 begrenzt " +
    "(siehe Annahmen unten). Die Datenkonfidenz spiegelt die schwächste " +
    "tatsächlich verwendete gemessene Quelle.",
  waterFallbackNote:
    "Für diese Region liegt kein Wasserfaktor für das Stromnetz vor — " +
    "ersatzweise gilt der US-Durchschnitt, die Konfidenz ist entsprechend begrenzt.",
  carbonFallbackNote:
    "Kein regionaler CO2-Faktor für das Stromnetz verfügbar — ersatzweise " +
    "gilt der US-Durchschnitt.",
  unknownModelHint: "Unbekanntes Modell: konservative Schätzung der Frontier-Klasse.",
  modelClassLine: (modelClass, factId) =>
    `Modellklasse: ${modelClass} · eingeordnet über ${factId}`,
  modelClassTip:
    "Die Größenklasse bestimmt, welche Energie-Messwerte verwendet werden (small, mid, frontier oder reasoning). " +
    "Sie ergibt sich aus dem hier genannten Fakt, der auch unten in den Tabellen steht.",
  factsUsedTitle: "Verwendete Fakten",
  factsUsedTip:
    "Jede Quelle, die in dieses Ergebnis eingeht. Bewertungen und Messgrenzen " +
    "werden angezeigt, damit die Zahlen nachprüfbar sind.",
  assumptionsTitle: "Annahmen",
  assumptionsTip:
    "Werte, die das Projekt selbst setzen musste, weil keine Quelle existiert. " +
    "Sie werden bewusst getrennt von belegten Fakten geführt.",
};

const TABLES: Record<string, Strings> = { en: EN, de: DE };
export function pick(lang: string): Strings {
  return TABLES[lang.slice(0, 2).toLowerCase()] ?? EN;
}

/** Language of the free-text fields in the fact table (data/*.json). */
export const FACT_TABLE_LANGUAGE = "de";

const FACT_LANGUAGE_NOTE =
  "The descriptions in the tables below are in German, the working language of the fact table. " +
  "Numbers, units and sources read the same in any language.";

/** Note shown above the fact tables when the page language differs from the fact table's language. */
export function factLanguageNote(pageLang: string): string {
  return pageLang.toLowerCase().startsWith(FACT_TABLE_LANGUAGE) ? "" : FACT_LANGUAGE_NOTE;
}
