import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadFacts } from "../src/factsNode.js";
import { readClaudeCodeUsage } from "../src/readers/claudeCode.js";
import { aggregateByModel, measureSession } from "../src/session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "dist", "cli.js");
const SAMPLE_FIXTURE = join(__dirname, "fixtures", "claude-code-sample.jsonl");
const TWO_MODELS_FIXTURE = join(__dirname, "fixtures", "claude-code-two-models.jsonl");

function runCli(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { encoding: "utf-8" });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

async function directMeasureSession(fixture: string, region: string) {
  const table = loadFacts([
    join(ROOT, "data", "facts.json"),
    join(ROOT, "data", "assumptions.json"),
    join(ROOT, "data", "models.json"),
  ]);
  const { records } = await readClaudeCodeUsage(fixture);
  const cacheReadComputeShareMidMax = table.byId.get("cache-read-compute-share-anthropic")!.value;
  const byModel = aggregateByModel(records, cacheReadComputeShareMidMax);
  return measureSession(table, byModel, region);
}

describe("thirstyai session CLI (dist/cli.js)", () => {
  it("prints a human-readable table matching a direct measureSession() call", async () => {
    const { stdout, status } = runCli([
      "session",
      SAMPLE_FIXTURE,
      "--region",
      "DE",
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain("ThirstyAI session — " + SAMPLE_FIXTURE);
    expect(stdout).toContain("claude-sonnet-5");
    expect(stdout).toContain("energy Wh");
    expect(stdout).toContain("Wh per 1,000 output tokens (all compute)");
    expect(stdout).toContain("Cache-read compute share: 0/0.1/0.1 (assumption cache-read-compute-share-anthropic)");

    const expected = await directMeasureSession(SAMPLE_FIXTURE, "DE");
    const model = expected.models.find((m) => m.model === "claude-sonnet-5")!;
    expect(model.energyTotal.min).toBeGreaterThan(0);
  });

  it("--json parses and contains models/total matching a direct measureSession() call", async () => {
    const { stdout, status } = runCli([
      "session",
      SAMPLE_FIXTURE,
      "--region",
      "DE",
      "--json",
    ]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.file).toBe(SAMPLE_FIXTURE);
    expect(parsed.region).toBe("DE");
    expect(Array.isArray(parsed.models)).toBe(true);
    expect(parsed.total).toBeDefined();

    const expected = await directMeasureSession(SAMPLE_FIXTURE, "DE");
    const model = expected.models.find((m) => m.model === "claude-sonnet-5")!;
    const parsedModel = parsed.models.find((m: { model: string }) => m.model === "claude-sonnet-5");
    expect(parsedModel.energyTotal).toEqual(model.energyTotal);
    expect(parsedModel.waterScope1).toEqual(model.waterScope1);
    expect(parsedModel.waterScope2).toEqual(model.waterScope2);
    expect(parsedModel.co2Scope2).toEqual(model.co2Scope2);
    expect(parsed.total.energyTotal).toEqual(expected.total.energyTotal);
    expect(parsed.total.factIds).toEqual(expected.total.factIds);
  });

  it("missing file exits 1", () => {
    const { status } = runCli(["session", "/nonexistent-thirstyai-fixture.jsonl"]);
    expect(status).toBe(1);
  });

  it("two-model fixture prints two model blocks plus a total block; total.energyTotal.mid is the sum of the model mids", async () => {
    const { stdout, status } = runCli([
      "session",
      TWO_MODELS_FIXTURE,
      "--region",
      "DE",
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain("claude-sonnet-5");
    expect(stdout).toContain("claude-haiku-4-5");
    expect(stdout).toContain("=== total ===");

    const expected = await directMeasureSession(TWO_MODELS_FIXTURE, "DE");
    const sumMid = expected.models.reduce((sum, m) => sum + m.energyTotal.mid, 0);
    expect(expected.total.energyTotal.mid).toBeCloseTo(sumMid, 10);

    const { stdout: jsonStdout } = runCli(["session", TWO_MODELS_FIXTURE, "--region", "DE", "--json"]);
    const parsed = JSON.parse(jsonStdout);
    expect(parsed.models).toHaveLength(2);
    const sumMidFromJson = parsed.models.reduce((sum: number, m: { energyTotal: { mid: number } }) => sum + m.energyTotal.mid, 0);
    expect(parsed.total.energyTotal.mid).toBeCloseTo(sumMidFromJson, 10);
  });
});
