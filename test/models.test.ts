import { describe, expect, it } from "vitest";
import { classifyModel } from "../src/models.js";
import { loadFacts } from "../src/factsNode.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS = new URL("../data/models.json", import.meta.url).pathname;

function tableWithModels() {
  // assumptions.json muss mitgeladen werden, weil class-claude-sonnet-5
  // (data/models.json) auf die dort registrierte Quelle "A-THIRSTYAI" verweist.
  return loadFacts([FACTS, ASSUMPTIONS, MODELS]);
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

  it("faellt bei bekannter Familie ohne Groessenhinweis auf frontier mit confidence 1 zurueck (seit Schritt 8: nur Familie ohne Marker zaehlt wie unbekannt)", () => {
    const result = classifyModel("gpt-5");
    expect(result.modelClass).toBe("frontier");
    expect(result.confidence).toBe(1);
  });

  it("staffelt die Namensheuristik-confidence: Familie+Groessenmarker=2, nur Familie oder unbekannt=1", () => {
    expect(classifyModel("gpt-4o-mini").confidence).toBe(2);
    expect(classifyModel("gpt-5").confidence).toBe(1);
    expect(classifyModel("xyzzy-modell-9000").confidence).toBe(1);
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

  it("loest einen bekannten Alias auf (exakter Name -> Alias -> Heuristik)", () => {
    // "mistral-large-latest" ist kein exakter Fakt-Name, aber ein
    // deklarierter Alias von params-mistral-large-2 - ohne Alias-Aufloesung
    // wuerde die Namensheuristik (FRONTIER_TOKENS: "large") faelschlich
    // "frontier" liefern.
    const result = classifyModel("mistral-large-latest", undefined, tableWithModels());
    expect(result.modelClass).toBe("mid");
    expect(result.sourceFactId).toBe("params-mistral-large-2");
  });
});
