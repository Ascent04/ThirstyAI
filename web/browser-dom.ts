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

function buildBar(row: ResultRangeLike): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "bar-wrap";

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
  boundaryCell.textContent = fact.measurement_boundary;
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

function buildFactsTable(title: string, ids: string[]): HTMLElement {
  const section = document.createElement("div");
  section.className = "facts-section";

  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);

  const table = document.createElement("table");
  table.className = "facts-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["ID", "Value", "Rating", "Confidence", "Measurement boundary", "Source"]) {
    const th = document.createElement("th");
    th.textContent = label;
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

  function recalculate(): void {
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

    const rows: { label: string; row: ResultRangeLike }[] = [
      { label: "Energy (Wh)", row: result.energyTotal },
      {
        label: "Water (ml)",
        row: {
          min: result.waterScope1.min + result.waterScope2.min,
          mid: result.waterScope1.mid + result.waterScope2.mid,
          max: result.waterScope1.max + result.waterScope2.max,
        },
      },
      { label: "CO2 (g)", row: result.co2Scope2 },
    ];

    for (const { label, row } of rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "result-row";
      const labelEl = document.createElement("div");
      labelEl.className = "result-label";
      labelEl.textContent = label;
      rowEl.appendChild(labelEl);
      rowEl.appendChild(buildBar(row));
      resultsEl.appendChild(rowEl);
    }

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = "Range = spread between credible sources' methods, not instrument error.";
    resultsEl.appendChild(note);

    const confidence = document.createElement("p");
    confidence.className = "confidence";
    confidence.textContent = `Confidence ${result.confidence}/5`;
    resultsEl.appendChild(confidence);

    if (result.confidence === 1) {
      const confidenceNote = document.createElement("p");
      confidenceNote.className = "note";
      confidenceNote.textContent =
        "Capped at 1/5 by the GPU-to-datacenter overhead factor — an unverified " +
        "assumption, not a measurement. The individual source ratings below are " +
        "mostly higher.";
      resultsEl.appendChild(confidenceNote);
    }

    if (isUnknownModel(model)) {
      const hint = document.createElement("p");
      hint.className = "unknown-model-hint";
      hint.textContent = "Unknown model: conservative frontier-class estimate.";
      resultsEl.appendChild(hint);
    }

    const assumptionIds = new Set(result.assumptions);
    const factsUsedIds = result.factIds.filter((id) => !assumptionIds.has(id));

    resultsEl.appendChild(buildFactsTable("Facts used", factsUsedIds));

    if (result.assumptions.length > 0) {
      const assumptionsBox = buildFactsTable("Assumptions", result.assumptions);
      assumptionsBox.className += " assumptions-box";
      resultsEl.appendChild(assumptionsBox);
    }
  }

  for (const el of [modelSelect, amountInput, amountUnitOutputTokens, amountUnitWords, tokensInInput, regionSelect]) {
    el.addEventListener("input", recalculate);
    el.addEventListener("change", recalculate);
  }

  recalculate();
});
