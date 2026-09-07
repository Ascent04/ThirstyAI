import { describe, expect, it } from "vitest";
import { readClaudeCodeUsage, toInputTokenRange } from "../src/readers/claudeCode.js";

const FIXTURE = new URL("./fixtures/claude-code-sample.jsonl", import.meta.url).pathname;

describe("readClaudeCodeUsage", () => {
  it("dedupliziert nach message.id und behaelt den Datensatz mit dem groessten output_tokens", async () => {
    const { records } = await readClaudeCodeUsage(FIXTURE);
    const msg1 = records.filter((r) => r.messageId === "msg_test_1");
    expect(msg1).toHaveLength(1);
    expect(msg1[0].outputTokens).toBe(150);
  });

  it("liest fehlende Cache-Felder als 0", async () => {
    const { records } = await readClaudeCodeUsage(FIXTURE);
    const msg2 = records.find((r) => r.messageId === "msg_test_2");
    expect(msg2).toBeDefined();
    expect(msg2?.cacheCreationTokens).toBe(0);
    expect(msg2?.cacheReadTokens).toBe(0);
  });

  it("ueberspringt Nutzer-Zeilen ohne usage, ohne sie zu zaehlen", async () => {
    const { records, skippedUnparsable, skippedSynthetic } = await readClaudeCodeUsage(FIXTURE);
    // 3 gueltige Assistant-Nachrichten (msg_test_1 dedupliziert, msg_test_2);
    // die Nutzer-Zeile taucht in keinem Zaehler auf.
    expect(records).toHaveLength(2);
    expect(skippedUnparsable).toBe(1);
    expect(skippedSynthetic).toBe(1);
  });

  it("zaehlt nicht parsbare Zeilen und synthetische Modelle, nimmt sie aber nicht in records auf", async () => {
    const { records, skippedUnparsable, skippedSynthetic } = await readClaudeCodeUsage(FIXTURE);
    expect(records.some((r) => r.model === "<synthetic>")).toBe(false);
    expect(skippedUnparsable).toBeGreaterThanOrEqual(1);
    expect(skippedSynthetic).toBe(1);
  });
});

describe("toInputTokenRange", () => {
  it("schliesst cacheReadTokens im Minimum aus und gewichtet es im Maximum mit dem uebergebenen Faktor", () => {
    const range = toInputTokenRange(
      {
        messageId: "x",
        timestamp: "",
        model: "claude-sonnet-5",
        inputTokens: 10,
        outputTokens: 100,
        cacheCreationTokens: 50,
        cacheReadTokens: 200,
      },
      0.1,
    );
    expect(range.min).toBe(60);
    expect(range.max).toBe(80);
  });

  it("min gleich max, wenn keine Cache-Reads vorliegen (Faktor spielt keine Rolle)", () => {
    const range = toInputTokenRange(
      {
        messageId: "y",
        timestamp: "",
        model: "claude-sonnet-5",
        inputTokens: 25,
        outputTokens: 40,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      },
      0.1,
    );
    expect(range.min).toBe(25);
    expect(range.max).toBe(25);
  });

  it("Faktor 0 macht max gleich min (untere Grenze des konzeptionellen Intervalls)", () => {
    const record = {
      messageId: "z",
      timestamp: "",
      model: "claude-sonnet-5",
      inputTokens: 10,
      outputTokens: 100,
      cacheCreationTokens: 50,
      cacheReadTokens: 200,
    };
    expect(toInputTokenRange(record, 0)).toEqual({ min: 60, max: 60 });
  });
});
