/**
 * Static calculator page entry. DOM-only wiring around calculateEmbedded();
 * not part of the public library API (src/index.ts). No network access,
 * no localStorage.
 */
import { calculateEmbedded, classifyEmbedded, factById, SOURCES, MODELS, REGIONS, FACTS_GENERATED } from "./browser-calc.js";
import { sourceLabel } from "./source-label.js";
import type { Fact } from "../src/facts.js";
import { pick } from "./strings.js";

const S = pick(document.documentElement.lang);

const UNKNOWN_MODEL_VALUE = "unknown-model";
const WORDS_TO_TOKENS = 1.3;

/**
 * 100 billion tokens. Not a physical limit but a numeric one: JavaScript only
 * represents whole numbers exactly up to about 9e15, and a calculator whose
 * arithmetic silently loses precision is worse than one that says no.
 */
const AMOUNT_MAX = 100_000_000_000;

/** Narrow no-break space: groups digits without a dot or comma, which mean
 *  opposite things either side of the Atlantic. */
const DIGIT_GROUP_SEPARATOR = "\u202F";

function groupDigits(value: number): string {
  const [whole, fraction] = String(value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, DIGIT_GROUP_SEPARATOR);
  return fraction === undefined ? grouped : `${grouped}${S.decimalSeparator}${fraction}`;
}

function fmtDecimal(value: number): string {
  return String(value).replace(".", S.decimalSeparator);
}

interface ResultRangeLike {
  min: number;
  mid: number;
  max: number;
}

function round3(v: number): number {
  return Number(v.toPrecision(3)); // 3 significant digits, same as CLI
}

let infoTipCounter = 0;

/**
 * Toggletip: a "?" button that reveals one sentence of explanation. Opening,
 * closing on an outside click, Escape and "only one open at a time" are all
 * handled by the browser through popover="auto" plus popovertarget - there is
 * no JS behind it. Static tips in index.html write the same two elements
 * directly in markup and behave identically. The ids only have to be unique;
 * the static ones are named after their field, so these numbered ones cannot
 * collide with them.
 */
function infoTip(text: string): HTMLElement {
  const id = `tip-${(infoTipCounter += 1)}`;

  const wrap = document.createElement("span");
  wrap.className = "info";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "info-btn";
  button.setAttribute("popovertarget", id);
  button.setAttribute("aria-label", S.infoExplanation);
  button.textContent = S.infoToggleGlyph;
  wrap.appendChild(button);

  const textEl = document.createElement("span");
  textEl.className = "info-text";
  textEl.setAttribute("popover", "");
  textEl.id = id;
  textEl.textContent = text;
  wrap.appendChild(textEl);

  return wrap;
}

type BarKind = "energy" | "water" | "carbon";

/** Base unit, thousand, million - in that order, per metric. */
const UNIT_STEPS: Record<BarKind, [string, string, string]> = {
  energy: ["Wh", "kWh", "MWh"],
  water: ["ml", "l", "m3"],
  carbon: ["g", "kg", "t"],
};

/**
 * Picks the unit for a whole result row from its max, so that min, mid and
 * max all carry the same unit and stay comparable at a glance. Applies to the
 * three result rows only - the facts table shows source values as recorded.
 */
function scaleRow(row: ResultRangeLike, kind: BarKind): { row: ResultRangeLike; unit: string } {
  const [base, thousand, million] = UNIT_STEPS[kind];
  const divisor = row.max < 1000 ? 1 : row.max < 1e6 ? 1000 : 1e6;
  const unit = row.max < 1000 ? base : row.max < 1e6 ? thousand : million;
  return {
    row: { min: row.min / divisor, mid: row.mid / divisor, max: row.max / divisor },
    unit,
  };
}

/** Start offset per metric, matching the transition-delay values in the CSS. */
const BAR_STAGGER_MS: Record<BarKind, number> = { energy: 0, water: 80, carbon: 160 };
const COUNT_UP_MS = 400;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function barNumbersText(row: ResultRangeLike): string {
  return S.barNumbers(fmtDecimal(round3(row.min)), fmtDecimal(round3(row.mid)), fmtDecimal(round3(row.max)));
}

/**
 * Counts the three figures up from zero over COUNT_UP_MS, after `delayMs`.
 * The closing frame writes the untouched `row` rather than an interpolated
 * value, so what stays on screen is bit-for-bit what the CLI prints.
 */
function countUpNumbers(el: HTMLElement, row: ResultRangeLike, delayMs: number): void {
  const start = performance.now() + delayMs;

  function frame(now: number): void {
    const progress = (now - start) / COUNT_UP_MS;
    if (progress >= 1) {
      el.textContent = barNumbersText(row);
      return;
    }
    if (progress > 0) {
      el.textContent = barNumbersText({
        min: row.min * progress,
        mid: row.mid * progress,
        max: row.max * progress,
      });
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function buildBar(row: ResultRangeLike, kind: BarKind): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `bar-wrap ${kind}`;

  const track = document.createElement("div");
  track.className = "bar-track";

  const minPct = row.max > 0 ? (row.min / row.max) * 100 : 0;
  const midPct = row.max > 0 ? (row.mid / row.max) * 100 : 0;

  const minSegment = document.createElement("div");
  minSegment.className = "bar-min";
  track.appendChild(minSegment);

  const midMarker = document.createElement("div");
  midMarker.className = "bar-mid-marker";
  midMarker.style.left = `${midPct}%`; // set once, never animated
  track.appendChild(midMarker);

  wrap.appendChild(track);

  const numbers = document.createElement("div");
  numbers.className = "bar-numbers";
  wrap.appendChild(numbers);

  if (prefersReducedMotion()) {
    minSegment.style.width = `${minPct}%`;
    midMarker.style.opacity = "1";
    numbers.textContent = barNumbersText(row);
    return wrap;
  }

  // Width has to be a settled 0 for one frame, otherwise the change to the
  // target width is coalesced into the same style recalculation and the bar
  // jumps instead of growing.
  minSegment.style.width = "0%";
  numbers.textContent = barNumbersText({ min: 0, mid: 0, max: 0 });
  requestAnimationFrame(() => {
    minSegment.style.width = `${minPct}%`;
    midMarker.style.opacity = "1";
  });
  countUpNumbers(numbers, row, BAR_STAGGER_MS[kind]);

  return wrap;
}

function boundaryText(fact: Fact): string {
  for (const value of [fact.measurement_boundary, fact.functional_unit, fact.water_scope]) {
    if (value && value !== "-") return value;
  }
  return S.boundaryFallback;
}

function buildFactRow(id: string): HTMLElement {
  const row = document.createElement("tr");
  const fact: Fact | undefined = factById(id);

  if (!fact) {
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = id;
    row.appendChild(cell);
    return row;
  }

  const idCell = document.createElement("td");
  idCell.textContent = fact.id;
  row.appendChild(idCell);

  const valueCell = document.createElement("td");
  valueCell.textContent = `${fact.value} ${fact.unit}`;
  row.appendChild(valueCell);

  const ratingCell = document.createElement("td");
  ratingCell.textContent = fact.rating;
  row.appendChild(ratingCell);

  const confidenceCell = document.createElement("td");
  confidenceCell.textContent = `${fact.confidence}/5`;
  row.appendChild(confidenceCell);

  const boundaryCell = document.createElement("td");
  boundaryCell.textContent = boundaryText(fact);
  row.appendChild(boundaryCell);

  const sourceCell = document.createElement("td");
  const source = SOURCES[fact.source_id];
  if (source) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = sourceLabel(source);
    link.title = source.title;
    sourceCell.appendChild(link);
  } else {
    sourceCell.textContent = fact.source_id;
  }
  row.appendChild(sourceCell);

  return row;
}

const COLUMNS: { label: string; tip: string }[] = [
  { label: S.columnId, tip: S.columnTipId },
  { label: S.columnValue, tip: S.columnTipValue },
  { label: S.columnRating, tip: S.columnTipRating },
  { label: S.columnConfidence, tip: S.columnTipConfidence },
  { label: S.columnMeasurementBoundary, tip: S.columnTipMeasurementBoundary },
  { label: S.columnSource, tip: S.columnTipSource },
];

function buildFactsTable(title: string, ids: string[], tipText: string): HTMLElement {
  const section = document.createElement("div");
  section.className = "facts-section";

  const heading = document.createElement("h3");
  heading.textContent = title;
  heading.appendChild(infoTip(tipText));
  section.appendChild(heading);

  const table = document.createElement("table");
  table.className = "facts-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const col of COLUMNS) {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.appendChild(infoTip(col.tip));
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const id of ids) {
    tbody.appendChild(buildFactRow(id));
  }
  table.appendChild(tbody);

  section.appendChild(table);
  return section;
}

function populateModelSelect(select: HTMLSelectElement): void {
  const sorted = [...MODELS].sort((a, b) => a.name.localeCompare(b.name));
  for (const model of sorted) {
    const option = document.createElement("option");
    option.value = model.aliases[0] ?? model.name;
    option.textContent = model.name;
    select.appendChild(option);
  }
  const other = document.createElement("option");
  other.value = UNKNOWN_MODEL_VALUE;
  other.textContent = S.otherUnknownModel;
  select.appendChild(other);
}

function populateRegionSelect(select: HTMLSelectElement): void {
  for (const region of REGIONS) {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    select.appendChild(option);
  }
  if (REGIONS.includes("DE")) {
    select.value = "DE";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const modelSelect = document.getElementById("model") as HTMLSelectElement;
  const amountInput = document.getElementById("amount") as HTMLInputElement;
  const amountUnitOutputTokens = document.getElementById("unit-output-tokens") as HTMLInputElement;
  const amountUnitWords = document.getElementById("unit-words") as HTMLInputElement;
  const derivedTokens = document.getElementById("derived-tokens") as HTMLElement;
  const tokensInInput = document.getElementById("tokens-in") as HTMLInputElement;
  const regionSelect = document.getElementById("region") as HTMLSelectElement;
  const factsGeneratedEl = document.getElementById("facts-generated") as HTMLElement;
  const resultsEl = document.getElementById("results") as HTMLElement;
  const calculateButton = document.getElementById("calculate") as HTMLButtonElement;
  const amountEcho = document.getElementById("amount-echo") as HTMLElement;

  populateModelSelect(modelSelect);
  populateRegionSelect(regionSelect);
  factsGeneratedEl.textContent = FACTS_GENERATED;

  function amountIsTooLarge(): boolean {
    return Number(amountInput.value) > AMOUNT_MAX;
  }

  function currentTokensOut(): number {
    const amount = Number(amountInput.value);
    return amountUnitWords.checked ? Math.round(amount * WORDS_TO_TOKENS) : amount;
  }

  /**
   * Echoes the entered amount back with grouped digits, so a figure like
   * 1 300 000 000 can be read without counting zeroes. Runs on every input,
   * independently of the Calculate button.
   */
  function updateAmountEcho(): void {
    if (amountIsTooLarge()) {
      amountEcho.textContent = S.amountTooLarge;
      derivedTokens.hidden = true;
      derivedTokens.textContent = "";
      return;
    }

    const amount = Number(amountInput.value);
    amountEcho.textContent = `${groupDigits(amount)} ${
      amountUnitWords.checked ? S.unitWords : S.unitOutputTokens
    }`;

    if (amountUnitWords.checked) {
      const tokens = Math.round(amount * WORDS_TO_TOKENS);
      derivedTokens.textContent = S.derivedTokens(groupDigits(tokens), fmtDecimal(WORDS_TO_TOKENS));
      derivedTokens.hidden = false;
      return;
    }
    derivedTokens.hidden = true;
    derivedTokens.textContent = "";
  }

  function isUnknownModel(model: string): boolean {
    return model === UNKNOWN_MODEL_VALUE;
  }

  function markStale(): void {
    resultsEl.classList.add("stale");
    calculateButton.classList.add("needs-attention");
  }

  function recalculate(): void {
    // Over the limit there is nothing sensible to compute. Bail out before
    // anything is cleared, so the stale state and the previous result stay as
    // they are - the echo line already says why nothing happened.
    if (amountIsTooLarge()) return;

    resultsEl.classList.remove("stale");
    calculateButton.classList.remove("needs-attention");
    resultsEl.innerHTML = "";

    const model = modelSelect.value;
    const tokensOut = currentTokensOut();
    const tokensIn = Number(tokensInInput.value) || 0;
    const region = regionSelect.value;

    let result;
    try {
      result = calculateEmbedded({ model, tokensIn, tokensOut, region });
    } catch (err) {
      const error = document.createElement("p");
      error.className = "error";
      error.textContent = err instanceof Error ? err.message : String(err);
      resultsEl.appendChild(error);
      return;
    }

    const rows: { label: string; tip: string; row: ResultRangeLike; kind: BarKind }[] = [
      {
        label: S.labelEnergy,
        // Just the metric here - how to read a bar is shown by the annotated
        // example in the empty state (index.html), not repeated per row.
        tip: S.tipEnergy,
        row: result.energyTotal,
        kind: "energy",
      },
      {
        label: S.labelWater,
        tip: S.tipWater,
        row: {
          min: result.waterScope1.min + result.waterScope2.min,
          mid: result.waterScope1.mid + result.waterScope2.mid,
          max: result.waterScope1.max + result.waterScope2.max,
        },
        kind: "water",
      },
      {
        label: S.labelCo2,
        tip: S.tipCo2,
        row: result.co2Scope2,
        kind: "carbon",
      },
    ];

    for (const { label, tip, row, kind } of rows) {
      const scaled = scaleRow(row, kind);
      const rowEl = document.createElement("div");
      rowEl.className = "result-row";
      const labelEl = document.createElement("div");
      labelEl.className = "result-label";
      labelEl.append(`${label} (${scaled.unit})`, infoTip(tip));
      rowEl.appendChild(labelEl);
      rowEl.appendChild(buildBar(scaled.row, kind));
      resultsEl.appendChild(rowEl);
    }

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = S.rangeNote;
    resultsEl.appendChild(note);

    const classification = classifyEmbedded(model);
    if (classification.sourceFactId) {
      const classLine = document.createElement("p");
      classLine.className = "confidence";
      classLine.append(
        S.modelClassLine(classification.modelClass, classification.sourceFactId),
        infoTip(S.modelClassTip),
      );
      resultsEl.appendChild(classLine);
    }

    const confidence = document.createElement("p");
    confidence.className = "confidence";
    confidence.append(
      S.dataConfidence(String(result.dataConfidence)),
      infoTip(S.dataConfidenceTip),
      " · ",
      S.methodConfidence(String(result.methodConfidence)),
      infoTip(S.methodConfidenceTip),
    );
    resultsEl.appendChild(confidence);

    const boundaryLine = document.createElement("p");
    boundaryLine.className = "confidence";
    boundaryLine.append(
      S.measurementBoundaryLine(result.boundary),
      infoTip(S.measurementBoundaryTip),
    );
    resultsEl.appendChild(boundaryLine);

    const boundaryNote = document.createElement("p");
    boundaryNote.className = "confidence-note";
    boundaryNote.textContent = S.operationOnlyNote;
    resultsEl.appendChild(boundaryNote);

    if (result.methodConfidence === 1) {
      const confidenceNote = document.createElement("p");
      confidenceNote.className = "confidence-note";
      confidenceNote.textContent = S.methodConfidenceCappedNote;
      resultsEl.appendChild(confidenceNote);
    }

    const factIdSet = new Set(result.factIds);
    if (
      region !== "US" &&
      factIdSet.has("region-fallback-confidence-cap") &&
      factIdSet.has("ewif-us-average")
    ) {
      const waterFallbackNote = document.createElement("p");
      waterFallbackNote.className = "confidence-note";
      waterFallbackNote.textContent = S.waterFallbackNote;
      resultsEl.appendChild(waterFallbackNote);
    }
    if (
      region !== "US" &&
      factIdSet.has("region-fallback-confidence-cap") &&
      factIdSet.has("grid-co2-egrid-us-2023")
    ) {
      const carbonFallbackNote = document.createElement("p");
      carbonFallbackNote.className = "confidence-note";
      carbonFallbackNote.textContent = S.carbonFallbackNote;
      resultsEl.appendChild(carbonFallbackNote);
    }

    if (isUnknownModel(model)) {
      const hint = document.createElement("p");
      hint.className = "unknown-model-hint";
      hint.textContent = S.unknownModelHint;
      resultsEl.appendChild(hint);
    }

    if (document.documentElement.lang.slice(0, 2).toLowerCase() !== "de") {
      const languageNote = document.createElement("p");
      languageNote.className = "confidence-note";
      languageNote.textContent =
        "The descriptions in the tables below are in German, the working language of the fact table. " +
        "Numbers, units and sources read the same in any language.";
      resultsEl.appendChild(languageNote);
    }

    const assumptionIds = new Set(result.assumptions);
    const factsUsedIds = result.factIds.filter((id) => !assumptionIds.has(id));

    resultsEl.appendChild(
      buildFactsTable(S.factsUsedTitle, factsUsedIds, S.factsUsedTip),
    );

    if (result.assumptions.length > 0) {
      const assumptionsBox = buildFactsTable(
        S.assumptionsTitle,
        result.assumptions,
        S.assumptionsTip,
      );
      assumptionsBox.className += " assumptions-box";
      resultsEl.appendChild(assumptionsBox);
    }
  }

  function onFormInput(): void {
    updateAmountEcho();
    markStale();
  }

  for (const el of [modelSelect, amountInput, amountUnitOutputTokens, amountUnitWords, tokensInInput, regionSelect]) {
    el.addEventListener("input", onFormInput);
    el.addEventListener("change", onFormInput);
  }

  // A preset fills the field in and marks the result stale; running the
  // calculation stays the user's decision, same as any other input.
  document.querySelectorAll<HTMLButtonElement>(".preset").forEach((button) => {
    button.addEventListener("click", () => {
      amountInput.value = button.dataset.amount ?? "";
      amountUnitOutputTokens.checked = true;
      onFormInput();
    });
  });

  calculateButton.addEventListener("click", recalculate);

  updateAmountEcho();
});
