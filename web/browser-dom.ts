/**
 * Static calculator page entry. DOM-only wiring around calculateEmbedded();
 * not part of the public library API (src/index.ts). No network access,
 * no localStorage.
 */
import { calculateEmbedded, factById, SOURCES, MODELS, REGIONS, FACTS_GENERATED } from "./browser-calc.js";
import type { Fact } from "../src/facts.js";

const UNKNOWN_MODEL_VALUE = "unknown-model";
const WORDS_TO_TOKENS = 1.3;

interface ResultRangeLike {
  min: number;
  mid: number;
  max: number;
}

function round3(v: number): number {
  return Number(v.toPrecision(3)); // 3 significant digits, same as CLI
}

/**
 * Toggletip: a "?" button that reveals one sentence of explanation on
 * click. Built once here and reused everywhere a tip is generated from
 * JS (the results area); static tips in index.html write the same three
 * elements directly in markup so they exist without JS. Either way, the
 * open/close behaviour below is a single delegated listener on `document`,
 * so it covers both origins alike.
 */
function infoTip(text: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "info";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "info-btn";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Explanation");
  button.textContent = "?";
  wrap.appendChild(button);

  const textEl = document.createElement("span");
  textEl.className = "info-text";
  textEl.hidden = true;
  textEl.textContent = text;
  wrap.appendChild(textEl);

  return wrap;
}

function closeAllInfoTips(): void {
  document
    .querySelectorAll<HTMLButtonElement>('.info-btn[aria-expanded="true"]')
    .forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      const textEl = button.nextElementSibling as HTMLElement | null;
      if (textEl) textEl.hidden = true;
    });
}

document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest(".info-btn") as HTMLButtonElement | null;
  if (!button) return;
  const wasOpen = button.getAttribute("aria-expanded") === "true";
  closeAllInfoTips();
  if (!wasOpen) {
    button.setAttribute("aria-expanded", "true");
    const textEl = button.nextElementSibling as HTMLElement | null;
    if (textEl) textEl.hidden = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAllInfoTips();
});

type BarKind = "energy" | "water" | "carbon";

function buildBar(row: ResultRangeLike, kind: BarKind): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `bar-wrap ${kind}`;

  const track = document.createElement("div");
  track.className = "bar-track";

  const minPct = row.max > 0 ? (row.min / row.max) * 100 : 0;
  const midPct = row.max > 0 ? (row.mid / row.max) * 100 : 0;

  const minSegment = document.createElement("div");
  minSegment.className = "bar-min";
  minSegment.style.width = `${minPct}%`;
  track.appendChild(minSegment);

  const midMarker = document.createElement("div");
  midMarker.className = "bar-mid-marker";
  midMarker.style.left = `${midPct}%`;
  track.appendChild(midMarker);

  wrap.appendChild(track);

  const numbers = document.createElement("div");
  numbers.className = "bar-numbers";
  numbers.textContent = `min ${round3(row.min)} · mid ${round3(row.mid)} · max ${round3(row.max)}`;
  wrap.appendChild(numbers);

  return wrap;
}

function boundaryText(fact: Fact): string {
  for (const value of [fact.measurement_boundary, fact.functional_unit, fact.water_scope]) {
    if (value && value !== "-") return value;
  }
  return "—";
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
    link.textContent = source.title;
    sourceCell.appendChild(link);
  } else {
    sourceCell.textContent = fact.source_id;
  }
  row.appendChild(sourceCell);

  return row;
}

const COLUMN_TIPS: Record<string, string> = {
  ID: "The identifier of this fact in data/facts.json.",
  Value: "The number as recorded, with its unit.",
  Rating:
    "Strength of evidence. BESTÄTIGT = confirmed by a second independent " +
    "source. EINZELQUELLE = one credible source. UMSTRITTEN = credible " +
    "sources disagree. ANNAHME = no source, set by the project.",
  Confidence: "How dependable this single value is, from 1 to 5.",
  "Measurement boundary":
    "What this value includes and leaves out. Two figures with the same " +
    "unit are not comparable if their boundaries differ.",
  Source: "The publication the value was taken from. The link goes to the original.",
};

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
  for (const label of ["ID", "Value", "Rating", "Confidence", "Measurement boundary", "Source"]) {
    const th = document.createElement("th");
    th.textContent = label;
    th.appendChild(infoTip(COLUMN_TIPS[label]));
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
  other.textContent = "Other / unknown model";
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

  populateModelSelect(modelSelect);
  populateRegionSelect(regionSelect);
  factsGeneratedEl.textContent = FACTS_GENERATED;

  function currentTokensOut(): number {
    const amount = Number(amountInput.value);
    if (amountUnitWords.checked) {
      const tokens = Math.round(amount * WORDS_TO_TOKENS);
      derivedTokens.textContent = `≈ ${tokens} output tokens, ×${WORDS_TO_TOKENS} assumption`;
      derivedTokens.hidden = false;
      return tokens;
    }
    derivedTokens.hidden = true;
    derivedTokens.textContent = "";
    return amount;
  }

  function isUnknownModel(model: string): boolean {
    return model === UNKNOWN_MODEL_VALUE;
  }

  function markStale(): void {
    resultsEl.classList.add("stale");
    calculateButton.classList.add("needs-attention");
  }

  function recalculate(): void {
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
        label: "Energy (Wh)",
        tip:
          "Electricity for one request, from the chip through the data " +
          "centre. Watt-hours: a 40-watt laptop running for one minute " +
          "uses about 0.7 Wh.",
        row: result.energyTotal,
        kind: "energy",
      },
      {
        label: "Water (ml)",
        tip:
          "Water evaporated for one request — cooling at the data centre " +
          "plus cooling at the power plants that supplied the electricity.",
        row: {
          min: result.waterScope1.min + result.waterScope2.min,
          mid: result.waterScope1.mid + result.waterScope2.mid,
          max: result.waterScope1.max + result.waterScope2.max,
        },
        kind: "water",
      },
      {
        label: "CO2 (g)",
        tip:
          "Carbon dioxide from generating the electricity for one request. " +
          "Location-based: the actual grid mix of the region, not green " +
          "power contracts.",
        row: result.co2Scope2,
        kind: "carbon",
      },
    ];

    for (const { label, tip, row, kind } of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "result-row";
      const labelEl = document.createElement("div");
      labelEl.className = "result-label";
      labelEl.append(label, infoTip(tip));
      rowEl.appendChild(labelEl);
      rowEl.appendChild(buildBar(row, kind));
      resultsEl.appendChild(rowEl);
    }

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Range = spread between credible sources' methods, not instrument error.";
    resultsEl.appendChild(note);

    const confidence = document.createElement("p");
    confidence.className = "confidence";
    confidence.append(
      `Data confidence ${result.dataConfidence}/5`,
      infoTip(
        "The weakest evidenced source that went into this result, from 1 " +
          "to 5. It says how good the data is.",
      ),
      " · ",
      `Method confidence ${result.methodConfidence}/5`,
      infoTip(
        "The weakest assumption that went into this result, from 1 to 5. " +
          "It says how sound the calculation is where no source exists.",
      ),
    );
    resultsEl.appendChild(confidence);

    const boundaryLine = document.createElement("p");
    boundaryLine.className = "confidence";
    boundaryLine.append(
      `Measurement boundary: ${result.boundary}`,
      infoTip(
        "How much of the system is counted. gpu-only means the figure " +
          "covers the chip and is scaled up to the data centre; fullstack " +
          "means it was measured across the whole stack.",
      ),
    );
    resultsEl.appendChild(boundaryLine);

    const boundaryNote = document.createElement("p");
    boundaryNote.className = "confidence-note";
    boundaryNote.textContent =
      "Operation only. Training, hardware manufacturing and data centre " +
      "construction are not included — see the FAQ on system boundary.";
    resultsEl.appendChild(boundaryNote);

    if (result.methodConfidence === 1) {
      const confidenceNote = document.createElement("p");
      confidenceNote.className = "confidence-note";
      confidenceNote.textContent =
        "Method confidence is capped at 1/5 by unverified assumptions (see " +
        "Assumptions below). Data confidence reflects the weakest measured " +
        "source actually used.";
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
      waterFallbackNote.textContent =
        "No grid water factor available for this region — the US average " +
        "is used as a fallback, and confidence is capped accordingly.";
      resultsEl.appendChild(waterFallbackNote);
    }
    if (
      region !== "US" &&
      factIdSet.has("region-fallback-confidence-cap") &&
      factIdSet.has("grid-co2-egrid-us-2023")
    ) {
      const carbonFallbackNote = document.createElement("p");
      carbonFallbackNote.className = "confidence-note";
      carbonFallbackNote.textContent =
        "No regional grid carbon factor available — the US average is " +
        "used as a fallback.";
      resultsEl.appendChild(carbonFallbackNote);
    }

    if (isUnknownModel(model)) {
      const hint = document.createElement("p");
      hint.className = "unknown-model-hint";
      hint.textContent = "Unknown model: conservative frontier-class estimate.";
      resultsEl.appendChild(hint);
    }

    const assumptionIds = new Set(result.assumptions);
    const factsUsedIds = result.factIds.filter((id) => !assumptionIds.has(id));

    resultsEl.appendChild(
      buildFactsTable(
        "Facts used",
        factsUsedIds,
        "Every source that went into this result. Ratings and boundaries " +
          "are shown so the numbers can be checked.",
      ),
    );

    if (result.assumptions.length > 0) {
      const assumptionsBox = buildFactsTable(
        "Assumptions",
        result.assumptions,
        "Values the project had to set itself because no source exists. " +
          "They are kept separate from evidenced facts on purpose.",
      );
      assumptionsBox.className += " assumptions-box";
      resultsEl.appendChild(assumptionsBox);
    }
  }

  for (const el of [modelSelect, amountInput, amountUnitOutputTokens, amountUnitWords, tokensInInput, regionSelect]) {
    el.addEventListener("input", markStale);
    el.addEventListener("change", markStale);
  }

  calculateButton.addEventListener("click", recalculate);
});
