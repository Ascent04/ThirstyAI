/**
 * Erste echte Messung: liest diese Claude-Code-Sitzung selbst und schickt
 * die aggregierten Zaehlwerte durch calculate(). Nicht Teil der
 * oeffentlichen API (kein Export aus src/index.ts), reines Beispiel-/
 * Analyseskript.
 *
 * tokensIn haengt vom Cache-Read-Rechenanteil ab (Fakt
 * cache-read-compute-share-anthropic, konzeptionell min 0 / mid 0.1 /
 * max 0.1). Deshalb je Modell/Region drei getrennte calculate()-Laeufe -
 * einen pro Faktor -, aus denen jeweils nur das dazu passende Feld
 * (min-Lauf -> .min, mid-Lauf -> .mid, max-Lauf -> .max) uebernommen wird.
 * Vorher wurde nur zwischen Faktor 0 (min) und 0.1 (max) gerechnet und
 * "mid" als Mittelwert der beiden mid-Ergebnisse gebildet - das entsprach
 * rechnerisch einem Cache-Faktor von 0.05, nicht dem dokumentierten
 * mid-Wert 0.1.
 *
 * Die Aggregation je Modell und die Drei-Laeufe-Logik liegen seit A2 in
 * src/session.ts (aggregateByModel, measureSession) - dieses Skript ist
 * nur noch ein duenner Aufrufer davon, damit CLI und Beispielskript
 * dieselbe Rechenlogik teilen.
 *
 * Ausfuehrung: erst `npm run build`, dann diese Datei kompilieren und mit
 * node ausfuehren (siehe docs/claude-code-reader.md).
 */
import { copyFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { calculate, loadFacts } from "../dist/index.js";
import { readClaudeCodeUsage, toInputTokenRange } from "../dist/readers/claudeCode.js";
import { aggregateByModel, measureSession } from "../dist/session.js";
import type { Range } from "../dist/session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Diese eine Sitzung (siehe Schritt 1/2 der Aufgabe). Kopie nach /tmp vor
// dem Lesen, damit nie die live wachsende Originaldatei gelesen wird.
const SESSION_SOURCE =
  process.argv[2] ?? "~/.claude/projects/<project-dir>/<session-id>.jsonl";
const SESSION_COPY = "/tmp/thirstyai-session.jsonl";

function fmt(r: Range, digits: number): string {
  return `${r.mid.toFixed(digits)} (${r.min.toFixed(digits)}-${r.max.toFixed(digits)})`;
}

async function main(): Promise<void> {
  copyFileSync(SESSION_SOURCE, SESSION_COPY);

  const { records, skippedUnparsable, skippedSynthetic } = await readClaudeCodeUsage(
    SESSION_COPY,
  );

  const timestamps = records.map((r) => r.timestamp).filter((t) => t !== "").sort();
  console.log("=== Zeitraum ===");
  console.log("frueheste:", timestamps[0]);
  console.log("spaeteste:", timestamps[timestamps.length - 1]);
  console.log();

  console.log("=== Zaehlerübersicht ===");
  console.log("Nachrichten mit Nutzungsdaten (dedupliziert):", records.length);
  console.log("skippedUnparsable:", skippedUnparsable);
  console.log("skippedSynthetic:", skippedSynthetic);
  console.log();

  const table = loadFacts([
    join(ROOT, "data", "facts.json"),
    join(ROOT, "data", "assumptions.json"),
    join(ROOT, "data", "models.json"),
  ]);
  const cacheReadComputeShareMidMax = table.byId.get("cache-read-compute-share-anthropic")?.value;
  if (cacheReadComputeShareMidMax === undefined) {
    throw new Error("Fakt 'cache-read-compute-share-anthropic' fehlt in data/assumptions.json");
  }
  console.log(
    `cacheReadComputeShare (aus data/assumptions.json): min=0 ` +
      `mid=${cacheReadComputeShareMidMax} max=${cacheReadComputeShareMidMax}`,
  );
  console.log();

  const byModel = aggregateByModel(records, cacheReadComputeShareMidMax);

  // Je Region einmal vorab berechnet, damit die Reihenfolge von
  // measurement.models exakt der Iterationsreihenfolge von byModel.values()
  // entspricht (dieselbe Map-Instanz in beiden Aufrufen).
  const measurementsByRegion = new Map(
    ["US", "EU"].map((region) => [region, measureSession(table, byModel, region)]),
  );

  let modelIndex = 0;
  for (const agg of byModel.values()) {
    console.log(`=== Modell: ${agg.model} ===`);
    console.log(
      `Nachrichten: ${agg.messageCount}  input=${agg.inputTokens}  output=${agg.outputTokens}  ` +
        `cacheCreation=${agg.cacheCreationTokens}  cacheRead=${agg.cacheReadTokens}`,
    );
    console.log(
      `tokensIn (summiert, je Cache-Read-Faktor): min=${agg.tokensInAtMin} ` +
        `mid=${agg.tokensInAtMid} max=${agg.tokensInAtMax}`,
    );

    const classification = measurementsByRegion.get("US")!.models[modelIndex].classification;
    console.log(
      `Klassifikationsweg: modelClass=${classification.modelClass} ` +
        `confidence=${classification.confidence} family=${classification.family} ` +
        `(${classification.sourceFactId ? "fakt-basiert: " + classification.sourceFactId : "Namensheuristik, kein Fakt-Treffer"})`,
    );
    console.log();

    for (const region of ["US", "EU"]) {
      // Drei getrennte Laeufe statt zwei - je Cache-Read-Faktor aus dem
      // min/mid/max-Tripel von cache-read-compute-share-anthropic ein
      // eigener tokensIn-Wert (siehe aggregateByModel). Aus jedem Lauf wird
      // nur das dazu passende Feld uebernommen (min-Lauf -> .min usw.),
      // nicht ueber zwei Extremlaeufe gemittelt - das ergab vorher
      // rechnerisch einen Cache-Faktor von 0.05 statt der dokumentierten
      // 0.1 fuer den mid-Fall.
      const measurement = measurementsByRegion.get(region)!.models[modelIndex];
      const { energyTotal, waterScope1, waterScope2, co2Scope2 } = measurement;

      const waterTotal = {
        min: waterScope1.min + waterScope2.min,
        max: waterScope1.max + waterScope2.max,
      };

      console.log(`--- Region ${region} (ANNAHME fuer US: keine reale Standortkenntnis) ---`);
      console.log(`Energie total (Wh):   ${fmt(energyTotal, 2)}`);
      console.log(`Wasser Standort (mL): ${fmt(waterScope1, 3)}`);
      console.log(`Wasser Strom (mL):    ${fmt(waterScope2, 3)}`);
      console.log(`Wasser gesamt (mL):   ${waterTotal.min.toFixed(3)}-${waterTotal.max.toFixed(3)}`);
      console.log(`CO2 Scope 2 (g):      ${fmt(co2Scope2, 4)}`);
      console.log(
        `Konfidenz: ${measurement.confidenceMin} (min-Lauf) / ${measurement.confidenceMid} (mid-Lauf) / ` +
          `${measurement.confidenceMax} (max-Lauf)`,
      );
      console.log(`factIds (min-Lauf): ${measurement.factIds.join(", ")}`);
      console.log();

      const per1k = agg.outputTokens / 1000;
      console.log(`Pro 1.000 Output-Token (${agg.outputTokens} Output-Token gesamt):`);
      console.log(
        `  Energie (Wh): min=${(energyTotal.min / per1k).toFixed(3)} ` +
          `mid=${(energyTotal.mid / per1k).toFixed(3)} max=${(energyTotal.max / per1k).toFixed(3)}`,
      );
      console.log();
    }

    modelIndex++;
  }

  // Defekt-Pruefung pro einzelner Nachricht (nicht aggregiert): negative
  // Werte, min > max, oder mehr als 100 Wh fuer eine einzelne Nachricht.
  let anyDefect = false;
  for (const record of records) {
    const range = toInputTokenRange(record, cacheReadComputeShareMidMax);
    for (const tokensIn of [range.min, range.max]) {
      const r = calculate({ model: record.model, region: "US", tokensIn, tokensOut: record.outputTokens }, table);
      for (const field of [r.energyTotal, r.waterScope1, r.waterScope2, r.co2Scope2]) {
        if (field.min < 0 || field.mid < 0 || field.max < 0) {
          console.log(`DEFEKT: negativer Wert bei Nachricht ${record.messageId}`);
          anyDefect = true;
        }
        if (field.min > field.max) {
          console.log(`DEFEKT: min > max bei Nachricht ${record.messageId}`);
          anyDefect = true;
        }
      }
      if (r.energyTotal.max > 100) {
        console.log(
          `DEFEKT: Einzelnachricht ${record.messageId} ueber 100 Wh (${r.energyTotal.max.toFixed(2)} Wh)`,
        );
        anyDefect = true;
      }
    }
  }
  console.log("=== Defekt-Pruefung ===");
  console.log(anyDefect ? "DEFEKT GEFUNDEN, siehe oben" : "keine Defekte (negativ/min>max/>100 Wh)");

  unlinkSync(SESSION_COPY);
  console.log();
  console.log(`/tmp-Kopie geloescht: ${SESSION_COPY}`);
}

main();
