import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOM_SRC = new URL("../web/browser-dom.ts", import.meta.url).pathname;
const BUNDLE = new URL("../docs/calculator/bundle.js", import.meta.url).pathname;

const NOTE_TEXT =
  "The descriptions in the tables below are in German, the working language of the fact table.";

describe("Sprachhinweis ueber den Faktentabellen (kein Schluessel der Texttabellen)", () => {
  it("web/browser-dom.ts enthaelt den Hinweistext genau einmal, hinter einer lang!==de-Bedingung", () => {
    const src = readFileSync(DOM_SRC, "utf-8");
    const occurrences = src.split(NOTE_TEXT).length - 1;
    expect(occurrences).toBe(1);
    expect(src).toMatch(/lang\.slice\(0, 2\)\.toLowerCase\(\) !== "de"/);
  });

  it("das eingecheckte Bundle enthält den Hinweistext (sonst fehlt npm run build:web)", () => {
    const bundle = readFileSync(BUNDLE, "utf-8");
    expect(bundle).toContain(NOTE_TEXT);
  });
});
