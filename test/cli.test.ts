import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { calculate } from "../src/calculate.js";
import { loadFacts } from "../src/facts.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "dist", "cli.js");

function runCli(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], { encoding: "utf-8" });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

describe("thirstyai calc CLI (dist/cli.js)", () => {
  it("prints a human-readable table for a valid call", () => {
    const { stdout, status } = runCli([
      "calc",
      "--model",
      "claude-sonnet-5",
      "--out",
      "1000",
      "--region",
      "DE",
    ]);
    expect(status).toBe(0);
    expect(stdout).toContain("ThirstyAI — claude-sonnet-5");
    expect(stdout).toContain("energy Wh");
    expect(stdout).toContain("water ml");
    expect(stdout).toContain("co2 g");
  });

  it("--json matches a direct calculate() call", () => {
    const { stdout, status } = runCli([
      "calc",
      "--model",
      "claude-sonnet-5",
      "--out",
      "1000",
      "--region",
      "DE",
      "--json",
    ]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);

    const table = loadFacts([
      join(ROOT, "data", "facts.json"),
      join(ROOT, "data", "assumptions.json"),
      join(ROOT, "data", "models.json"),
    ]);
    const expected = calculate(
      { model: "claude-sonnet-5", tokensIn: 0, tokensOut: 1000, region: "DE" },
      table,
    );

    expect(parsed.energyTotal).toEqual(expected.energyTotal);
    expect(parsed.waterScope1).toEqual(expected.waterScope1);
    expect(parsed.waterScope2).toEqual(expected.waterScope2);
    expect(parsed.co2Scope2).toEqual(expected.co2Scope2);
    expect(parsed.confidence).toBe(expected.confidence);
    expect(parsed.factIds).toEqual(expected.factIds);
  });

  it("missing --model exits 1 with usage on stderr", () => {
    expect(() =>
      execFileSync("node", [CLI, "calc", "--out", "1000"], { encoding: "utf-8" }),
    ).toThrowError(
      expect.objectContaining({
        status: 1,
        stderr: expect.stringContaining("Usage:"),
      }),
    );
  });

  it("unknown --year exits 2 with the library's error text", () => {
    expect(() =>
      execFileSync(
        "node",
        [CLI, "calc", "--model", "claude-sonnet-5", "--out", "1000", "--year", "1999"],
        { encoding: "utf-8" },
      ),
    ).toThrowError(
      expect.objectContaining({
        status: 2,
        stderr: expect.stringContaining("1999"),
      }),
    );
  });
});
