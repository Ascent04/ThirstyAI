import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Rohe Zaehlwerte einer einzelnen Assistant-Nachricht aus einem Claude-Code-
 * Sitzungsprotokoll (JSONL). Enthaelt ausschliesslich Zaehlfelder aus
 * message.usage - niemals message.content.
 */
export interface ClaudeCodeUsageRecord {
  messageId: string;
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ReadClaudeCodeUsageResult {
  records: ClaudeCodeUsageRecord[];
  /** Zeilen, die nicht als JSON geparst werden konnten oder keine gueltige
   * message.id trugen. */
  skippedUnparsable: number;
  /** Zeilen mit model === "<synthetic>" (keine echte Modellanfrage). */
  skippedSynthetic: number;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Liest ein Claude-Code-Sitzungsprotokoll (JSONL) zeilenweise und liefert
 * eine deduplizierte Liste von Zaehlwerten pro Nachricht.
 *
 * Eine einzelne Anfrage kann sich ueber mehrere JSONL-Zeilen erstrecken
 * (ein Streaming-Chunk pro Content-Block), alle mit identischer
 * message.usage - dedupliziert wird ueber message.id. Bei mehreren Zeilen
 * mit derselben message.id wird die mit dem groessten output_tokens
 * behalten (konservativ: falls Werte je Zeile abweichen sollten, zaehlt
 * der vollstaendigste Stand).
 *
 * Liest ausschliesslich: die oberste Ebene "timestamp", sowie
 * message.id, message.model und message.usage.* (input_tokens,
 * output_tokens, cache_creation_input_tokens, cache_read_input_tokens).
 * message.content wird nie geparst oder inspiziert - thinking_tokens wird
 * bewusst nicht gelesen (siehe output_tokens-Kommentar unten).
 *
 * output_tokens schliesst laut empirischer Pruefung thinking_tokens ein
 * (Korrelation 0.977 ueber 153 Nachrichten, output_tokens nie kleiner als
 * thinking_tokens); ein separates Auslesen von thinking_tokens ist daher
 * fuer die Gesamtzaehlung nicht noetig.
 *
 * Aufrufer-Pflicht: filePath sollte eine Kopie der Sitzungsdatei sein
 * (z.B. unter /tmp), nicht die live wachsende Originaldatei - diese
 * Funktion prueft das nicht selbst.
 *
 * Keine Abhaengigkeiten ausser node:fs/node:readline. Nicht ueber
 * src/index.ts exportiert.
 */
export async function readClaudeCodeUsage(filePath: string): Promise<ReadClaudeCodeUsageResult> {
  const byMessageId = new Map<string, ClaudeCodeUsageRecord>();
  let skippedUnparsable = 0;
  let skippedSynthetic = 0;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim() === "") continue;

    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      skippedUnparsable++;
      continue;
    }

    if (typeof data !== "object" || data === null) {
      skippedUnparsable++;
      continue;
    }
    const top = data as Record<string, unknown>;
    const msg = top.message;
    if (typeof msg !== "object" || msg === null) continue;
    const msgObj = msg as Record<string, unknown>;
    const usage = msgObj.usage;
    if (typeof usage !== "object" || usage === null) continue;
    const usageObj = usage as Record<string, unknown>;

    const model = msgObj.model;
    if (model === "<synthetic>") {
      skippedSynthetic++;
      continue;
    }

    const messageId = msgObj.id;
    if (typeof messageId !== "string" || messageId === "" || typeof model !== "string") {
      skippedUnparsable++;
      continue;
    }

    const record: ClaudeCodeUsageRecord = {
      messageId,
      timestamp: typeof top.timestamp === "string" ? top.timestamp : "",
      model,
      inputTokens: numberOrZero(usageObj.input_tokens),
      outputTokens: numberOrZero(usageObj.output_tokens),
      cacheCreationTokens: numberOrZero(usageObj.cache_creation_input_tokens),
      cacheReadTokens: numberOrZero(usageObj.cache_read_input_tokens),
    };

    const existing = byMessageId.get(messageId);
    if (!existing || record.outputTokens > existing.outputTokens) {
      byMessageId.set(messageId, record);
    }
  }

  return {
    records: [...byMessageId.values()],
    skippedUnparsable,
    skippedSynthetic,
  };
}

/**
 * ANNAHME, confidence 1 (Fakt "cache-read-compute-share-anthropic" in
 * data/assumptions.json): Cache-Reads werden als Intervall behandelt statt
 * als fester Wert. min schliesst cacheReadTokens komplett aus (ein
 * Cache-Treffer braucht im Idealfall keine erneute Verarbeitung). max
 * zaehlt cacheReadTokens mit `cacheReadComputeShare` gewichtet - Anthropics
 * eigenes Preisverhaeltnis fuer Cache-Reads (0.1x der normalen
 * Input-Token) dient dabei als Proxy fuer den Rechenanteil, keine
 * Energiemessung. cacheCreationTokens zaehlen in beiden Faellen voll, da
 * sie in jedem Fall frisch verarbeitete Eingabe sind.
 *
 * cacheReadComputeShare wird bewusst nicht hart codiert, sondern vom
 * Aufrufer aus data/assumptions.json geladen (Fakt-ID
 * "cache-read-compute-share-anthropic", value 0.1) und hier uebergeben -
 * damit bleibt die Annahme an einer Stelle sourcebar und aenderbar.
 * Kurze Methodik-Fassung und bekannte Einschraenkungen:
 * docs/claude-code-reader.md.
 */
export function toInputTokenRange(
  record: ClaudeCodeUsageRecord,
  cacheReadComputeShare: number,
): { min: number; max: number } {
  const base = record.inputTokens + record.cacheCreationTokens;
  return { min: base, max: base + cacheReadComputeShare * record.cacheReadTokens };
}
