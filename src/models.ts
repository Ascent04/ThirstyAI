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

/**
 * Sucht in data/models.json (category "parameters") nach einem Fakt, dessen
 * Modellname vollstaendig in den Tokens der Anfrage enthalten ist (z.B.
 * "Llama 3.1 70B" -> ["llama","3","1","70b"] passt in
 * "llama-3.1-70b-instruct"). Bei mehreren Treffern gewinnt der spezifischste
 * (meiste Tokens), damit z.B. "70B" nicht von einem kuerzeren Treffer
 * ueberdeckt wird.
 */
function findParameterFact(tokens: string[], table: FactTable): Fact | undefined {
  const tokenSet = new Set(tokens);
  let best: Fact | undefined;
  let bestSize = 0;

  for (const fact of table.facts) {
    if (fact.category !== "parameters") continue;
    const factTokens = tokenize(fact.model_or_object);
    if (factTokens.length === 0) continue;
    const isSubset = factTokens.every((token) => tokenSet.has(token));
    if (isSubset && factTokens.length > bestSize) {
      best = fact;
      bestSize = factTokens.length;
    }
  }
  return best;
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
    const parameterFact = findParameterFact(tokens, table);
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
      confidence: 3,
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }

  const explicitSize = sizeInBillionParamsFromTokens(tokens);
  if (explicitSize !== undefined) {
    return {
      modelClass: bucketBySize(explicitSize),
      confidence: 3,
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }

  if (tokens.some((token) => SMALL_TOKENS.includes(token))) {
    return { modelClass: "small", confidence: 3, fullstack: false, family: family ?? "unbekannt" };
  }
  if (tokens.some((token) => MID_TOKENS.includes(token))) {
    return { modelClass: "mid", confidence: 3, fullstack: false, family: family ?? "unbekannt" };
  }
  if (tokens.some((token) => FRONTIER_TOKENS.includes(token))) {
    return {
      modelClass: "frontier",
      confidence: 3,
      fullstack: false,
      family: family ?? "unbekannt",
    };
  }

  if (family !== undefined) {
    return { modelClass: "frontier", confidence: 2, fullstack: false, family };
  }

  return { modelClass: "frontier", confidence: 1, fullstack: false, family: "unbekannt" };
}
