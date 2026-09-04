/**
 * Ruft ThirstyAI fuer jeden Fall aus docs/crosscheck/cases.json ueber den
 * oeffentlichen Einstieg (dist/index.js, siehe src/index.ts) auf und
 * schreibt docs/crosscheck/thirstyai.json.
 *
 * classifyModel wird zusaetzlich direkt aus dist/models.js importiert -
 * das ist keine oeffentliche API (siehe src/index.ts), sondern dient hier
 * nur der Diagnose: ob ThirstyAI den Modellnamen erkannt hat oder auf eine
 * Rueckfallklasse ausgewichen ist (siehe Schritt 2 der Aufgabe).
 *
 * Ausfuehrung: erst `npm run build`, dann diese Datei kompilieren und mit
 * node ausfuehren (siehe scripts/README.md).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { calculate, loadFacts } from "../dist/index.js";
import { classifyModel } from "../dist/models.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CASES_PATH = join(ROOT, "docs", "crosscheck", "cases.json");
const OUTPUT_PATH = join(ROOT, "docs", "crosscheck", "thirstyai.json");

interface Case {
  id: string;
  thirstyai: { model: string };
  tokensIn: number;
  tokensOut: number;
}

interface CasesFile {
  region: string;
  cases: Case[];
}

function main(): void {
  const data: CasesFile = JSON.parse(readFileSync(CASES_PATH, "utf-8"));
  const table = loadFacts([
    join(ROOT, "data", "facts.json"),
    join(ROOT, "data", "assumptions.json"),
    join(ROOT, "data", "models.json"),
  ]);

  const results = data.cases.map((c) => {
    const classification = classifyModel(c.thirstyai.model, undefined, table);
    const result = calculate(
      { model: c.thirstyai.model, region: data.region, tokensIn: c.tokensIn, tokensOut: c.tokensOut },
      table,
    );

    return {
      id: c.id,
      model: c.thirstyai.model,
      tokensIn: c.tokensIn,
      tokensOut: c.tokensOut,
      classification,
      // confidence 3 heisst: Modellname direkt anhand von Groesse/Namenshinweis
      // erkannt. confidence 1/2 heisst: Rueckfall (unbekanntes Modell bzw.
      // bekannte Familie ohne Groessenhinweis) - siehe src/models.ts.
      recognized: classification.confidence >= 3,
      energyWh: result.energyTotal,
      co2G: result.co2Scope2,
      waterMl: {
        min: result.waterScope1.min + result.waterScope2.min,
        mid: result.waterScope1.mid + result.waterScope2.mid,
        max: result.waterScope1.max + result.waterScope2.max,
      },
      waterScope1Ml: result.waterScope1,
      waterScope2Ml: result.waterScope2,
      confidence: result.confidence,
      boundary: result.boundary,
      factIds: result.factIds,
      assumptions: result.assumptions,
    };
  });

  writeFileSync(OUTPUT_PATH, JSON.stringify({ results }, null, 2) + "\n");
  console.log(`Geschrieben: ${OUTPUT_PATH}`);
}

main();
