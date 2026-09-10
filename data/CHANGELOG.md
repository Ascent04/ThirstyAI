# Fact File Changelog

## Unreleased

- Confidence split into `dataConfidence` and `methodConfidence`,
  derived from the facts used and their rating.
- Measurement boundaries documented for all 21 grid water facts.
- Swedish and Dutch grid water facts reclassified as UMSTRITTEN
  (S2 conflicts with S8).
- EWIF for IE, NL, SE and FI resolved as a range across the two
  competing sources instead of a single point value.
- +1 grid water factor: `ewif-germany` (WRI Appendix 2, source S27);
  DE is now resolved as a range as well.
- Mistral LCA facts marked as cross-check only (different system
  boundary); +1 fact `mistral-l2-materials` (ADP, source S3).
- New web calculator under `docs/calculator/`.

**Effect on results**: water min for region DE moves from 0.500 to
0.480 ml per 1,000 output tokens. This is the only change in this
block that shifts an existing result.

## v0.2 - 2026-09-03

- Merged v0.1 + reviewed addendum (Claude Deep Research) + own
  verification.
- +7 measured inference values for open models (GPU-only).
- +16 grid-mix CO2 factors (Ember-verified, UBA, EMA, RTE, eGRID).
- +4 LBNL industry averages.
- Added negative-finding register.
- v0.1 rows unchanged.
