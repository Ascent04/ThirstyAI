/**
 * Node-only loader. Keep src/facts.ts free of Node imports so it can be
 * bundled for browsers.
 */
import { readFileSync } from "node:fs";
import { buildFactTable, type RawFactFile, type FactTable } from "./facts.js";

function readJsonFile(path: string): RawFactFile {
  const text = readFileSync(path, "utf-8");
  return JSON.parse(text) as RawFactFile;
}

/**
 * Lädt eine oder mehrere Faktendateien und führt sie zu einer Tabelle
 * zusammen. Quellenregister werden vereinigt (spätere Dateien überschreiben
 * gleiche Quellen-IDs), Fakten werden über alle Dateien geprüft: Pflichtfelder
 * gefüllt, IDs eindeutig, source_id im Quellenregister, confidence 1-5,
 * value numerisch, optionale Aliase (Groß-/Kleinschreibung ignorierend)
 * eindeutig über die ganze Tabelle.
 */
export function loadFacts(paths: string[]): FactTable {
  return buildFactTable(paths.map(readJsonFile));
}
