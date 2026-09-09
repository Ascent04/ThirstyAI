# ThirstyAI

<p align="center">
  <img src="docs/assets/banner.jpg" alt="ThirstyAI – water, energy and CO2 footprint of AI calls" width="800">
</p>

*[Deutsch](README-de.md)*

**Status: in development**

## Purpose

ThirstyAI is a TypeScript library that estimates the water, electricity,
and CO2 consumption of an AI request from model name, token count, and
region. The result is deliberately a range (minimum, mean, maximum), not
a single number, because the underlying measurements come from
different system boundaries, regions, and methods. For every result,
the library also provides the sources used and a confidence rating
(1-5), so it stays visible how reliable a number is.

The library makes no network calls at runtime and has no runtime
dependencies. All facts live offline in `data/facts.json` and are each
backed by a source, a locator, and a direct quote.

## Installation

Not yet published to npm. Until then, use it from source:

```bash
git clone https://github.com/Ascent04/ThirstyAI.git
cd thirstyai
npm install
npm run build
npm test        # expected: 39 tests passing
```

## Usage

```typescript
import { loadFacts, calculate } from "thirstyai";

const table = loadFacts([
  "node_modules/thirstyai/data/facts.json",
  "node_modules/thirstyai/data/assumptions.json",
  "node_modules/thirstyai/data/models.json",
]);

const result = calculate(
  { model: "claude-3-5-sonnet", tokensIn: 200, tokensOut: 300, region: "DE" },
  table,
);

console.log(
  `Water (on-site): ${result.waterScope1.min.toFixed(2)}-` +
    `${result.waterScope1.max.toFixed(2)} mL (mid ${result.waterScope1.mid.toFixed(2)})`,
);
console.log(
  `Water (electricity generation): ${result.waterScope2.min.toFixed(2)}-` +
    `${result.waterScope2.max.toFixed(2)} mL`,
);
console.log(
  `CO2 (Scope 2): ${result.co2Scope2.min.toFixed(3)}-${result.co2Scope2.max.toFixed(3)} g`,
);
console.log(`Confidence: ${result.confidence}/5, sources: ${result.factIds.join(", ")}`);
```

`loadFacts` reads and validates the fact files, `calculate` returns the
result. Both calls are synchronous and make no network calls. All three
files are needed: `facts.json` contains the sourced measurements,
`assumptions.json` contains our own assumption facts (e.g. input cost
share, overhead factor), `models.json` contains known model sizes
(parameter counts) for classification - `calculate` draws on all of
them depending on the model and calculation step; if one is missing,
the calculation fails with an error naming the missing fact ID.

## What the numbers mean

- **waterScope1** and **waterScope2** are kept separate, not added
  together: waterScope1 is cooling water that evaporates at the data
  center itself; waterScope2 is water consumed generating the
  electricity for the facility. Both come from different sources and
  system boundaries, and a sum would be harder to follow than the two
  individual figures.
- **co2Scope2** deliberately covers only the emissions of electricity
  consumption (location-/market-based). Hardware manufacturing (Scope
  3) and refrigerants (Scope 1) are not included - the field name makes
  that visible on purpose, instead of suggesting a total that cannot be
  derived. Details and a concrete example of this gap are in
  [docs/methodology.md](docs/methodology.md).
- **confidence** (1-5) is the minimum of the confidence values of all
  coefficients actually used for this result - except for a few
  universal assumptions that go into every calculation and would
  otherwise make the number meaningless (rationale in
  docs/methodology.md). A low confidence does not mean "wrong," but
  "estimated on thinner evidence" - for example because the region was
  unknown and the calculation fell back to US averages. `factIds` and
  `assumptions` in the result show exactly which facts and own
  assumptions went into it.

## Cross-check against EcoLogits

ThirstyAI's results were checked offline against
[EcoLogits](https://ecologits.ai/) (Python, GenAI Impact, JOSS 2025) for
ten cases across five model families. For models with a publicly known
size, both tools agree to within ±30%; for proprietary models, they
diverge by a factor of 3-6, because both have to estimate the model
size. Full tables and the reasoning behind each deviation:
[docs/crosscheck/results.md](docs/crosscheck/results.md).

## Related projects

- **EcoLogits** (Python, [JOSS 2025](https://joss.theoj.org/)): also
  estimates the environmental impact of LLM requests, focused on Python
  SDKs of major providers. ThirstyAI differs in three ways:
  - **Per-coefficient sourcing**: every numeric value used carries its
    own source ID, locator, and confidence, instead of one overall
    disclaimer.
  - **Water scope separation**: water consumption (evaporated) and
    water withdrawal (mostly returned) are not mixed together, since
    providers use the two terms differently.
  - **TypeScript** instead of Python, for use in Node and web
    environments.

## Fact file

`data/facts.json` is a curated collection of publicly sourced
measurements and estimates (schema version and generation date are
recorded in the file header). It is not modified. Our own, clearly
labeled assumptions live separately in `data/assumptions.json`.

How the facts carried over from the research addendum were later
checked against their primary sources is documented (German only) in
[docs/verification-v0.2.md](docs/verification-v0.2.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the proof requirements for
new facts.

```
        .          _____  _     _            _            _     ___
       ( )        |_   _||_    (_) _ _  ___ | |_  _  _   / \   |_ _|
      (   )         | |  | ' \ | || '_|(_-< |  _|| || | / _ \   | |
       '-'          |_|  |_||_||_||_|  /__/  \__|\_, | /_/ \_\ |___|
   ~ ~ ~ ~ ~                                     |__/
                        water | energy | CO2 footprint of AI calls
```
