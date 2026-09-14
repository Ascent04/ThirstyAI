export const EN = {
  infoExplanation: "Explanation",
  infoToggleGlyph: "?",
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

const TABLES: Record<string, Strings> = { en: EN };
export function pick(lang: string): Strings {
  return TABLES[lang.slice(0, 2).toLowerCase()] ?? EN;
}
