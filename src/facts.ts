import { readFileSync } from "node:fs";

export type Rating = "BESTÄTIGT" | "EINZELQUELLE" | "UMSTRITTEN" | "ANNAHME";

const VALID_RATINGS: readonly Rating[] = [
  "BESTÄTIGT",
  "EINZELQUELLE",
  "UMSTRITTEN",
  "ANNAHME",
];

export interface Source {
  title: string;
  publisher: string;
  year: number;
  url: string;
  type: string;
  verified: string;
}

export interface Fact {
  id: string;
  category: string;
  phase: string;
  model_or_object: string;
  value: number;
  unit: string;
  functional_unit: string;
  measurement_boundary: string;
  water_scope: string;
  carbon_accounting: string;
  region: string;
  year: number;
  rating: Rating;
  confidence: number;
  source_id: string;
  locator: string;
  quote: string;
  second_source: string;
  note: string;
  /** Known alternative names for the same item (e.g. model names in
   * different provider spellings). Optional, must be unique across the
   * whole table (see loadFacts). */
  aliases?: string[];
}

export interface FactTable {
  sources: Record<string, Source>;
  facts: Fact[];
  byId: Map<string, Fact>;
}

interface RawFactFile {
  sources?: Record<string, Source>;
  facts?: Fact[];
}

/**
 * Wird geworfen, wenn eine Zeile der Faktendatei nicht dem Schema entspricht.
 * factId identifiziert die betroffene Zeile für die Fehlersuche.
 */
export class FactValidationError extends Error {
  public readonly factId: string;

  constructor(factId: string, message: string) {
    super(`Fakt "${factId}": ${message}`);
    this.name = "FactValidationError";
    this.factId = factId;
  }
}

const REQUIRED_STRING_FIELDS: (keyof Fact)[] = [
  "id",
  "category",
  "phase",
  "model_or_object",
  "unit",
  "functional_unit",
  "measurement_boundary",
  "water_scope",
  "carbon_accounting",
  "region",
  "rating",
  "source_id",
  "locator",
  "quote",
  "second_source",
  "note",
];

function readJsonFile(path: string): RawFactFile {
  const text = readFileSync(path, "utf-8");
  return JSON.parse(text) as RawFactFile;
}

function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim();
}

function validateFact(
  fact: Fact,
  sources: Record<string, Source>,
  byId: Map<string, Fact>,
  seenAliases: Map<string, string>,
): void {
  const id = fact?.id;
  if (typeof id !== "string" || id === "") {
    throw new FactValidationError(
      String(id ?? "<ohne ID>"),
      "Feld 'id' fehlt oder ist leer",
    );
  }
  if (byId.has(id)) {
    throw new FactValidationError(id, "doppelte ID");
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = fact[field];
    if (value === undefined || value === null || value === "") {
      throw new FactValidationError(id, `Pflichtfeld '${field}' fehlt`);
    }
  }
  if (typeof fact.value !== "number" || !Number.isFinite(fact.value)) {
    throw new FactValidationError(id, "Feld 'value' ist nicht numerisch");
  }
  if (typeof fact.year !== "number" || !Number.isFinite(fact.year)) {
    throw new FactValidationError(id, "Feld 'year' ist nicht numerisch");
  }
  if (!VALID_RATINGS.includes(fact.rating)) {
    throw new FactValidationError(id, `ungültiges rating '${String(fact.rating)}'`);
  }
  if (
    !Number.isInteger(fact.confidence) ||
    fact.confidence < 1 ||
    fact.confidence > 5
  ) {
    throw new FactValidationError(
      id,
      `confidence muss 1-5 sein, ist '${String(fact.confidence)}'`,
    );
  }
  if (!(fact.source_id in sources)) {
    throw new FactValidationError(
      id,
      `source_id '${fact.source_id}' ist nicht im Quellenregister`,
    );
  }
  if (fact.aliases !== undefined) {
    if (!Array.isArray(fact.aliases)) {
      throw new FactValidationError(id, "Feld 'aliases' ist kein Array");
    }
    for (const alias of fact.aliases) {
      if (typeof alias !== "string" || alias.trim() === "") {
        throw new FactValidationError(id, "Eintrag in 'aliases' ist kein nicht-leerer String");
      }
      const key = normalizeAlias(alias);
      const owner = seenAliases.get(key);
      if (owner !== undefined) {
        throw new FactValidationError(
          id,
          `Alias '${alias}' ist nicht eindeutig (bereits bei Fakt '${owner}')`,
        );
      }
      seenAliases.set(key, id);
    }
  }
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
  const rawFiles = paths.map(readJsonFile);

  const sources: Record<string, Source> = {};
  for (const raw of rawFiles) {
    Object.assign(sources, raw.sources ?? {});
  }

  const facts: Fact[] = [];
  const byId = new Map<string, Fact>();
  const seenAliases = new Map<string, string>();
  for (const raw of rawFiles) {
    for (const fact of raw.facts ?? []) {
      validateFact(fact, sources, byId, seenAliases);
      byId.set(fact.id, fact);
      facts.push(fact);
    }
  }

  return { sources, facts, byId };
}

export interface FactFilter {
  category?: string;
  region?: string;
  model_or_object?: string;
  ids?: string[];
  predicate?: (fact: Fact) => boolean;
}

/**
 * Gruppiert die zum Filter passenden Fakten nach (category, model_or_object,
 * region) und liefert je Gruppe den Fakt mit dem höchsten Jahr zurück. Ist
 * asOf gesetzt, werden Fakten mit year > asOf-Jahr vorher ausgeschlossen, so
 * dass nur Fakten gewählt werden, die zum Stichtag bereits bekannt waren.
 */
export function latest(table: FactTable, filter: FactFilter, asOf?: Date): Fact[] {
  const cutoffYear = asOf ? asOf.getFullYear() : undefined;

  const candidates = table.facts.filter((fact) => {
    if (filter.category !== undefined && fact.category !== filter.category) {
      return false;
    }
    if (filter.region !== undefined && fact.region !== filter.region) {
      return false;
    }
    if (
      filter.model_or_object !== undefined &&
      fact.model_or_object !== filter.model_or_object
    ) {
      return false;
    }
    if (filter.ids !== undefined && !filter.ids.includes(fact.id)) {
      return false;
    }
    if (filter.predicate !== undefined && !filter.predicate(fact)) {
      return false;
    }
    if (cutoffYear !== undefined && fact.year > cutoffYear) {
      return false;
    }
    return true;
  });

  const bestByKey = new Map<string, Fact>();
  for (const fact of candidates) {
    const key = `${fact.category}|${fact.model_or_object}|${fact.region}`;
    const current = bestByKey.get(key);
    if (!current || fact.year > current.year) {
      bestByKey.set(key, fact);
    }
  }
  return [...bestByKey.values()];
}
