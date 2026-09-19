import { describe, expect, it } from "vitest";
import { EN, DE, factLanguageNote } from "../web/strings.js";

describe("Sprachhinweis ueber den Faktentabellen", () => {
  it("erscheint, wenn die Seitensprache nicht die Sprache der Faktentabelle ist", () => {
    expect(factLanguageNote("en").length).toBeGreaterThan(0);
    expect(factLanguageNote("").length).toBeGreaterThan(0);
  });

  it("bleibt leer auf deutschen Seiten", () => {
    expect(factLanguageNote("de")).toBe("");
    expect(factLanguageNote("de-DE")).toBe("");
    expect(factLanguageNote("DE")).toBe("");
  });

  it("ist kein Schluessel der Texttabellen, die Paritaetspruefung bleibt unberuehrt", () => {
    expect("factLanguageNote" in EN).toBe(false);
    expect("factLanguageNote" in DE).toBe(false);
  });
});
