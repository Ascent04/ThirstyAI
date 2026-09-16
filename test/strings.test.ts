import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EN, DE } from "../web/strings.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EN_HTML = readFileSync(path.join(HERE, "../docs/calculator/index.html"), "utf8");
const DE_HTML = readFileSync(path.join(HERE, "../docs/calculator/index-de.html"), "utf8");

const WHITELIST = ["infoToggleGlyph", "boundaryFallback", "labelCo2", "columnId", "barNumbers"];

function callWithExample(fn: (...args: string[]) => string): string {
  switch (fn.length) {
    case 3:
      return fn("1", "2", "3");
    case 2:
      return fn("1", "1.3");
    default:
      return fn("gpu-only");
  }
}

function extractIds(html: string): string[] {
  return [...html.matchAll(/\bid="([^"]*)"/g)].map((m) => m[1]).sort();
}

function extractStyleBlocks(html: string): string[] {
  return [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]);
}

function extractScriptTags(html: string): string[] {
  return [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
}

function countOccurrences(haystack: string, needle: string): number {
  return [...haystack.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))].length;
}

function parityReport(en: string, de: string): string[] {
  const deviations: string[] = [];

  const enIds = extractIds(en);
  const deIds = extractIds(de);
  if (JSON.stringify(enIds) !== JSON.stringify(deIds)) {
    deviations.push("ids differ");
  }

  const enStyles = extractStyleBlocks(en);
  const deStyles = extractStyleBlocks(de);
  if (enStyles.length !== deStyles.length || enStyles.some((s, i) => s !== deStyles[i])) {
    deviations.push("style blocks differ");
  }

  const enScripts = extractScriptTags(en);
  const deScripts = extractScriptTags(de);
  if (enScripts.length !== deScripts.length || enScripts.some((s, i) => s !== deScripts[i])) {
    deviations.push("script tags differ");
  }

  if (countOccurrences(de, 'lang="de"') !== 1 || countOccurrences(de, 'lang="en"') !== 0) {
    deviations.push("de lang attribute count wrong");
  }
  if (countOccurrences(en, 'lang="en"') !== 1) {
    deviations.push("en lang attribute count wrong");
  }

  return deviations;
}

describe("strings", () => {
  it("DE hat dieselben Schluessel wie EN", () => {
    expect(Object.keys(DE).sort()).toEqual(Object.keys(EN).sort());
  });

  it("DE-Werte sind uebersetzt", () => {
    for (const key of Object.keys(EN) as (keyof typeof EN)[]) {
      const enValue = EN[key];
      const deValue = DE[key];

      if (typeof enValue === "function") {
        const enResult = callWithExample(enValue as (...args: string[]) => string);
        const deResult = callWithExample(deValue as (...args: string[]) => string);
        expect(deResult.length).toBeGreaterThan(0);
        if (!WHITELIST.includes(key)) {
          expect(deResult).not.toBe(enResult);
        }
      } else {
        expect((deValue as string).length).toBeGreaterThan(0);
        if (!WHITELIST.includes(key)) {
          expect(deValue).not.toBe(enValue);
        }
      }
    }
  });

  it("index-de.html ist strukturgleich zu index.html", () => {
    expect(parityReport(EN_HTML, DE_HTML)).toEqual([]);
  });

  it("parityReport erkennt eine entfernte ID (Negativprobe)", () => {
    const brokenDe = DE_HTML.replace('id="model"', "");
    expect(parityReport(EN_HTML, brokenDe)).not.toEqual([]);
  });
});
