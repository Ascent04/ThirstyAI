import { describe, expect, it } from "vitest";
import { classifyModel } from "../src/models.js";
import { loadFacts } from "../src/facts.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const MODELS = new URL("../data/models.json", import.meta.url).pathname;

function tableWithModels() {
  return loadFacts([FACTS, MODELS]);
}

describe("classifyModel", () => {
  it("erkennt kleine Modelle an Groessen- oder Namenshinweisen", () => {
    expect(classifyModel("gpt-4o-mini").modelClass).toBe("small");
    expect(classifyModel("claude-3-5-haiku").modelClass).toBe("small");
    expect(classifyModel("llama-3.1-8b-instruct").modelClass).toBe("small");
  });

  it("erkennt mittlere Modelle an expliziter Groesse oder Namenshinweisen", () => {
    expect(classifyModel("llama-3.1-70b-instruct").modelClass).toBe("mid");
    expect(classifyModel("claude-3-5-sonnet").modelClass).toBe("mid");
    expect(classifyModel("gemini-1.5-flash").modelClass).toBe("mid");
  });

  it("erkennt Frontier-Modelle", () => {
    expect(classifyModel("llama-3.1-405b").modelClass).toBe("frontier");
    expect(classifyModel("claude-3-opus").modelClass).toBe("frontier");
    expect(classifyModel("mistral-large-2").modelClass).toBe("frontier");
  });

  it("erkennt Reasoning-Modelle", () => {
    expect(classifyModel("o1-preview").modelClass).toBe("reasoning");
    expect(classifyModel("deepseek-r1").modelClass).toBe("reasoning");
    expect(classifyModel("qwen-3-thinking").modelClass).toBe("reasoning");
  });

  it("erkennt Gemini Apps als Vollstack-Sonderfall", () => {
    const result = classifyModel("gemini-apps");
    expect(result.fullstack).toBe(true);
  });

  it("faellt bei unbekanntem Modell auf frontier mit confidence 1 zurueck", () => {
    const result = classifyModel("xyzzy-modell-9000");
    expect(result.modelClass).toBe("frontier");
    expect(result.confidence).toBe(1);
  });

  it("faellt bei bekannter Familie ohne Groessenhinweis auf frontier mit confidence 2 zurueck", () => {
    const result = classifyModel("gpt-5");
    expect(result.modelClass).toBe("frontier");
    expect(result.confidence).toBe(2);
  });

  it("nutzt eine bekannte Parameterzahl aus data/models.json vor der Namensheuristik", () => {
    const result = classifyModel("mistral-large-2", undefined, tableWithModels());
    expect(result.modelClass).toBe("mid");
    expect(result.sourceFactId).toBe("params-mistral-large-2");
    // Ohne Fakten-Tabelle wuerde dieselbe Zeichenkette ueber die
    // Namensheuristik (FRONTIER_TOKENS: "large") falsch als "frontier"
    // eingeordnet - das zeigt, warum die Fakten-Pruefung zuerst kommt.
    expect(classifyModel("mistral-large-2").modelClass).toBe("frontier");
  });
});
