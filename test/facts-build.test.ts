import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildFactTable, loadFacts, type RawFactFile } from "../src/facts.js";
import { calculate } from "../src/calculate.js";

const FACTS = new URL("../data/facts.json", import.meta.url).pathname;
const ASSUMPTIONS = new URL("../data/assumptions.json", import.meta.url).pathname;
const MODELS = new URL("../data/models.json", import.meta.url).pathname;

describe("buildFactTable", () => {
  it("mergt/validiert wie loadFacts, ohne eigenes fs, und liefert fuer [] eine leere Tabelle", () => {
    const rawFiles: RawFactFile[] = [FACTS, ASSUMPTIONS, MODELS].map(
      (path) => JSON.parse(readFileSync(path, "utf-8")) as RawFactFile,
    );

    const fromBuild = buildFactTable(rawFiles);
    const fromLoad = loadFacts([FACTS, ASSUMPTIONS, MODELS]);
    expect(fromBuild).toEqual(fromLoad);

    const input = { model: "claude-sonnet-5", tokensIn: 0, tokensOut: 1000, region: "DE" };
    const resultFromBuild = calculate(input, fromBuild);
    const resultFromLoad = calculate(input, fromLoad);
    expect(resultFromBuild).toEqual(resultFromLoad);

    const emptyTable = buildFactTable([]);
    expect(emptyTable.sources).toEqual({});
    expect(emptyTable.facts).toEqual([]);
    expect(emptyTable.byId).toEqual(new Map());
  });
});
