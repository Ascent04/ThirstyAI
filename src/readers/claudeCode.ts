import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Rohe Zählwerte einer einzelnen Assistant-Nachricht aus einem Claude-Code-
 * Sitzungsprotokoll (JSONL). Enthält ausschließlich Zählfelder aus
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
  /** Zeilen, die nicht als JSON geparst werden konnten oder keine gültige
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
 * eine deduplizierte Liste von Zählwerten pro Nachricht.
 *
 * Eine einzelne Anfrage kann sich über mehrere JSONL-Zeilen erstrecken
 * (ein Streaming-Chunk pro Content-Block), alle mit identischer
 * message.usage - dedupliziert wird über message.id. Bei mehreren Zeilen
 * mit derselben message.id wird die mit dem größten output_tokens
 * behalten (konservativ: falls Werte je Zeile abweichen sollten, zählt
 * der vollständigste Stand).
 *
 * Liest ausschließlich: die oberste Ebene "timestamp", sowie
 * message.id, message.model und message.usage.* (input_tokens,
 * output_tokens, cache_creation_input_tokens, cache_read_input_tokens).
 * message.content wird nie geparst oder inspiziert - thinking_tokens wird
 * bewusst nicht gelesen (siehe output_tokens-Kommentar unten).
 *
 * output_tokens schließt laut empirischer Prüfung thinking_tokens ein
 * (Korrelation 0.977 über 153 Nachrichten, output_tokens nie kleiner als
 * thinking_tokens); ein separates Auslesen von thinking_tokens ist daher
 * für die Gesamtzählung nicht nötig.
 *
 * Aufrufer-Pflicht: filePath sollte eine Kopie der Sitzungsdatei sein
 * (z.B. unter /tmp), nicht die live wachsende Originaldatei - diese
 * Funktion prüft das nicht selbst.
 *
 * Keine Abhängigkeiten außer node:fs/node:readline. Nicht über
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
 * als fester Wert. min schließt cacheReadTokens komplett aus (ein
 * Cache-Treffer braucht im Idealfall keine erneute Verarbeitung). max
 * zählt cacheReadTokens mit `cacheReadComputeShare` gewichtet - Anthropics
 * eigenes Preisverhältnis für Cache-Reads (0.1x der normalen
 * Input-Token) dient dabei als Proxy für den Rechenanteil, keine
 * Energiemessung. cacheCreationTokens zählen in beiden Fällen voll, da
 * sie in jedem Fall frisch verarbeitete Eingabe sind.
 *
 * cacheReadComputeShare wird bewusst nicht hart codiert, sondern vom
 * Aufrufer aus data/assumptions.json geladen (Fakt-ID
 * "cache-read-compute-share-anthropic", value 0.1) und hier übergeben -
 * damit bleibt die Annahme an einer Stelle sourcebar und änderbar.
 * Kurze Methodik-Fassung und bekannte Einschränkungen:
 * docs/claude-code-reader.md.
 */
export function toInputTokenRange(
  record: ClaudeCodeUsageRecord,
  cacheReadComputeShare: number,
): { min: number; max: number } {
  const base = record.inputTokens + record.cacheCreationTokens;
  return { min: base, max: base + cacheReadComputeShare * record.cacheReadTokens };
}
