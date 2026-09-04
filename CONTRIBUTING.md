# Contributing

## Proof requirements for new facts

ThirstyAI depends on every number in `data/facts.json` being
verifiable. A pull request that adds a new fact or a new source
**must** fill in the following fields for every row:

- **Source**: title, publisher, year, URL.
- **Locator**: chapter, table, section, or page number within the
  source where the value appears.
- **Quote**: the exact original sentence or value from the source, as a
  quote, not paraphrased.
- **System boundary** (`measurement_boundary`): exactly what was
  measured or calculated (e.g. GPU only, fullstack including PUE, a
  model calculation from assumptions).
- **Rating** (`rating`): one of `BESTÄTIGT` (confirmed: primary source
  plus an independent second source), `EINZELQUELLE` (single source: one
  credible primary source), `UMSTRITTEN` (disputed: sources contradict
  each other), or `ANNAHME` (assumption: no source, our own estimate).

**Pull requests without these fields will be rejected.**

## Own assumptions

Values without a source do not belong in `data/facts.json`; they belong
in `data/assumptions.json`, with `rating: "ANNAHME"`, `confidence: 1`,
and `source_id: "A-THIRSTYAI"`.

## Tests

Every change to code or data needs a test. A pull request without a
green test run (`npm test`) will not be accepted.
