import type { Fact, FactTable } from "./facts.js";

export type ModelClass = "small" | "mid" | "frontier" | "reasoning";

export interface ModelClassification {
  modelClass: ModelClass;
  confidence: number;
  fullstack: boolean;
  family: string;
  /** Fakt-ID aus data/models.json, falls die Klasse ueber eine bekannte
   * Parameterzahl statt ueber die Namensheuristik bestimmt wurde. */
  sourceFactId?: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_./:]+/)
    .filter((token) => token.length > 0);
}

const FAMILY_TOKENS: Record<string, string[]> = {
  gpt: ["gpt", "chatgpt", "o1", "o3", "o4"],
  claude: ["claude"],
  gemini: ["gemini"],
  llama: ["llama"],
  mistral: ["mistral", "mixtral"],
  deepseek: ["deepseek"],
  qwen: ["qwen"],
};

function detectFamily(tokens: string[]): string | undefined {
  for (const [family, keys] of Object.entries(FAMILY_TOKENS)) {
    if (tokens.some((token) => keys.includes(token))) {
      return family;
    }
  }
  return undefined;
}

const REASONING_TOKENS = ["o1", "o3", "o4", "r1", "reason", "reasoning", "thinking"];
const SMALL_TOKENS = ["mini", "nano", "haiku", "small", "lite"];
const MID_TOKENS = ["sonnet", "flash", "medium"];
const FRONTIER_TOKENS = ["opus", "ultra", "large", "pro"];

function sizeInBillionParamsFromTokens(tokens: string[]): number | undefined {
  for (const token of tokens) {
    const single = token.match(/^(\d+(?:\.\d+)?)b$/);
    if (single) {
      return Number(single[1]);
    }
    const moe = token.match(/^(\d+)x(\d+)b$/);
    if (moe) {
      return Number(moe[1]) * Number(moe[2]);
    }
  }
  return undefined;
}

function bucketBySize(paramsB: number): ModelClass {
  if (paramsB <= 10) return "small";
  if (paramsB <= 200) return "mid";
  return "frontier";
}

function tokensEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, i) => token === b[i]);
}

/**
 * Sucht in data/models.json (category "parameters") nach einem Fakt, dessen
 * kanonischer Name (model_or_object) oder einer seiner Aliase genau (Gross-
 * /Kleinschreibung und Trennzeichen ignorierend) der Anfrage entspricht -
 * "exakter Name, dann Alias", siehe Klassifikations-Reihenfolge unten. Keine
 * Teilstring-/Teilmengen-Suche: ein unbekannter Namensvariante (z.B. ein
 * anderer Praefix oder Suffix) faellt bewusst auf die Namensheuristik
 * zurueck, statt geraten zu werden.
 */
function findExactOrAliasFact(tokens: string[], table: FactTable): Fact | undefined {
  const parameterFacts = table.facts.filter((fact) => fact.category === "parameters");

  for (const fact of parameterFacts) {
    if (tokensEqual(tokens, tokenize(fact.model_or_object))) {
      return fact;
    }
  }
  for (const fact of parameterFacts) {
    for (const alias of fact.aliases ?? []) {
      if (tokensEqual(tokens, tokenize(alias))) {
        return fact;
      }
    }
  }
  return undefined;
}

/** confidence fuer einen ueber die Namensheuristik erkannten Groessen-/
 * Verhaltensmarker (Reasoning-Token, explizite Groessenangabe, Namenshinweis
 * wie "mini"/"large"): 2, wenn zusaetzlich eine Modellfamilie erkannt wurde,
 * sonst 1 (die Familie allein traegt die Aussage nicht). */
function markerConfidence(family: string | undefined): number {
  return family !== undefined ? 2 : 1;
}

/**
 * Ordnet einen Modellnamen einer groben Groessenklasse zu. Die Klasse
 * bestimmt in resolve.ts, welche Energie-Koeffizienten verwendet werden.
 * Ein unbekannter Modellname (keine erkennbare Familie, keine Groessen- oder
 * Reasoning-Hinweise) faellt auf "frontier" mit confidence 1 zurueck, da das
 * die konservativste (energieintensivste) Annahme ist.
 */
export function classifyModel(
  model: string,
  provider?: string,
  table?: FactTable,
): ModelClassification {
  const tokens = tokenize(model);
  const family =
    detectFamily(tokens) ?? (provider ? detectFamily(tokenize(provider)) : undefined);

  const isGeminiApps =
    family === "gemini" && (tokens.includes("app") || tokens.includes("apps"));
  if (isGeminiApps) {
    return { modelClass: "frontier", confidence: 3, fullstack: true, family: "gemini" };
  }

  if (table) {
    const parameterFact = findExactOrAliasFact(tokens, table);
    if (parameterFact) {
      return {
        modelClass: bucketBySize(parameterFact.value),
        confidence: parameterFact.confidence,
        fullstack: false,
        family: family ?? "unbekannt",
        sourceFactId: parameterFact.id,
      };
    }
  }

  if (tokens.some((token) => REASONING_TOKENS.includes(token))) {
    return {
      modelClass: "reasoning",
      confidence: markerConfidence(family),
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }

  const explicitSize = sizeInBillionParamsFromTokens(tokens);
  if (explicitSize !== undefined) {
    return {
      modelClass: bucketBySize(explicitSize),
      confidence: markerConfidence(family),
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }

  if (tokens.some((token) => SMALL_TOKENS.includes(token))) {
    return {
      modelClass: "small",
      confidence: markerConfidence(family),
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }
  if (tokens.some((token) => MID_TOKENS.includes(token))) {
    return {
      modelClass: "mid",
      confidence: markerConfidence(family),
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }
  if (tokens.some((token) => FRONTIER_TOKENS.includes(token))) {
    return {
      modelClass: "frontier",
      confidence: markerConfidence(family),
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }

  // Weder Fakt noch Groessen-/Verhaltensmarker: mit oder ohne bekannte
  // Familie gleichermassen unbelegt, daher confidence 1 in beiden Faellen.
  return { modelClass: "frontier", confidence: 1, fullstack: false, family: family ?? "unbekannt" };
}
