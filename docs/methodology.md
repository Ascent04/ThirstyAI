# Methodology (Draft)

This document describes ThirstyAI's calculation path, all of its own
assumptions (not backed by the fact file), and the methodological gaps
that remain open. It does not replace checking sources case by case -
that's what `factIds` in the result and `data/facts.json` are for.

## Calculation path

Input: model name, optionally provider and region, number of input and
output tokens, optionally a cutoff date (`asOf`).

1. **Resolve coefficients** (`src/resolve.ts`): derive the model class
   (small/mid/frontier/reasoning) from the model name, then five ranges
   with source attribution: energy per request (GPU-only, or already
   fullstack for Gemini Apps), overhead factor (GPU to IT energy), PUE,
   WUE (on-site cooling water), and EWIF (water from electricity
   generation) plus the grid's CO2 factor.
2. **Scale to token count**: the energy coefficients are stated in Wh
   per 1,000 output tokens, converted from the original Wh-per-request
   fact and the average output token count of the matching benchmark
   measurement (`src/resolve.ts:OUTPUT_TOKENS_FOR_ENERGY_FACT`, see open
   issue 1). Input tokens count for 10% as much as an output token
   (prefill is cheaper than decoding, see assumptions below).
   `effectiveTokens = tokensOut + 0.1 * tokensIn`, scaled linearly by
   `effectiveTokens / 1000`.
3. **energyGpu -> energyIt**: for fullstack facts (currently only Gemini
   Apps) the starting value is already total energy including PUE;
   `energyIt` is derived by dividing by PUE. Otherwise it is multiplied
   by the overhead factor (assumption, 1.7-2.4x) to go from pure GPU
   energy to full IT energy (including host, idle, network).
4. **energyTotal**: `energyIt * PUE` - for fullstack this exactly
   reproduces `energyGpu` (round trip), since PUE was already included
   there.
5. **waterScope1**: `energyIt * WUE` - on-site evaporation, based on IT
   energy (not on the PUE overhead, which also covers things like the
   cooling pumps themselves).
6. **waterScope2**: `energyTotal * EWIF` - water consumed generating the
   electricity for the whole facility.
7. **co2Scope2**: `energyTotal * emission factor / 1000` - emissions of
   electricity consumption (location-/market-based, depending on the
   fact). Hardware manufacturing (Scope 3) and refrigerants (Scope 1)
   are not included, see open issue 3.

### CO2 intensity by region

`resolveCarbonIntensity` (`src/resolve.ts:CARBON_REGION_TABLE_BY_YEAR`)
resolves min/mid/max per region for a given reference year (currently
only 2024 is populated): **mid** is the national reference source where
one exists (UBA for DE, RTE for FR, EMA for SG, eGRID for US), Ember
otherwise. **min/max** are the smallest/largest value among the
recognized 2024 sources (EEA, Ember, the national reference), including
mid itself - so the interval reflects the spread *between independent
sources' methodologies*, not measurement uncertainty within one source.
Regions without a second, independent 2024 source (IN, JP - Ember is the
only figure available) have min = mid = max. eGRID's 2023 edition
(`grid-co2-egrid-us-2023`) is used as the US 2024 reference, since it is
still the most recent eGRID release. Google is the one exception: it
uses Google's own fleet-wide, market-based emission factor
(`google-ef-mb-2024`) instead of the region table, since Gemini Apps is
served from Google's global fleet, not a fixed region.

**referenceYear**: an optional parameter (`calculate`/`resolveCoefficients`,
default `DEFAULT_REFERENCE_YEAR` = 2024) that selects which year's
region table is used; it is also echoed back in the result so a reader
can see which vintage of grid data a number is based on. An unknown
reference year (no entry in `CARBON_REGION_TABLE_BY_YEAR`) throws an
error rather than silently falling back. 2025 carbon-intensity facts
(Ember 2025, see the v0.3 addendum) already exist in `data/facts.json`
but are deliberately not yet referenced by any region-table entry: a
2025 table would need the 2025 editions of both EEA and eGRID to keep
the min/max methodology-spread logic consistent, and neither is
available yet.

All steps are multiplication or division by positive values, never
subtraction. Consistently applying each coefficient's min or max value
at every step (for division, cross-wise: the smallest quotient comes
from the largest divisor) keeps min <= mid <= max automatically true in
every result field.

**Confidence**: the minimum of the confidence values of all coefficients
actually used - with one exception, see the rule below. Conditional
assumptions and fallbacks (the overhead factor for non-fullstack, the
WUE withdrawal-to-consumption assumption for AWS/Meta, the WUE fallback
bounds when no provider is known, the class-specific energy values
depending on model class, the confidence cap for an unknown region) do
count, because they only affect part of the calculations and so
genuinely distinguish well-supported cases from weakly-supported ones.

**Rule for universal assumptions**: an assumption that goes into *every*
single calculation without exception - regardless of model, provider,
region, or the fullstack/GPU-only path - does not feed into confidence.
If it did, every result's confidence would always be capped at its
(typically low) value, no matter how well-supported the other,
genuinely distinguishing coefficients are - the metric would then just
equal that one constant and could no longer distinguish well-supported
from weakly-supported calculations. Two facts are currently affected:

- `input-token-cost-share` (input cost share, calculate.ts)
- `pue-range-half-width` (PUE range, resolve.ts) - applies to every
  single PUE resolution, regardless of provider

The flat reference token count formerly listed here
(`reference-output-tokens`, 300 tokens for every calculation) is no
longer a universal assumption: scaling now happens per energy fact via
`OUTPUT_TOKENS_FOR_ENERGY_FACT` (`src/resolve.ts`), and its uncertainty
- unlike before - feeds into the regular confidence calculation (see
open issue 1).

This is a deliberate trade-off, not concealment: both remaining facts
still appear in `assumptions`, so their uncertainty remains visible -
it just doesn't affect the confidence number. Readers should therefore
read confidence as "conditional on accepting these two universal
assumptions," not as an absolute measure of certainty.

## Own assumptions (`data/assumptions.json`)

All with `rating: "ANNAHME"` (ASSUMPTION), `confidence: 1`, `source_id:
"A-THIRSTYAI"`:

- **energy-small-lower-bound** (0.01 Wh): rough lower bound for small
  models, without its own measurement.
- **overhead-factor-min/mid/max** (1.7 / 2.0 / 2.4): GPU-to-IT-energy
  range, based on MIT Technology Review and the ratio of Google's
  fullstack figure to its narrow system boundary.
- **reference-output-tokens** (300 tokens): removed on 2026-09-08,
  superseded by the per-fact token mapping
  (`OUTPUT_TOKENS_FOR_ENERGY_FACT`, `src/resolve.ts`), see open issue 1.
- **input-token-cost-share** (0.1): see open issue 2.
- **frontier-class-joule-median** (0.39 Wh), **frontier-class-joule-iqr-max**
  (0.68 Wh): numbers that only appeared in a fact's `second_source` field
  (the Joule Monte Carlo estimate), pulled out here as their own,
  referenced assumptions so that resolve.ts
  contains no numeric literals.
- **pue-range-half-width** (0.1): our own spread around the PUE point
  estimate, since providers usually report PUE without an uncertainty
  range. Since Zyklus C this spread is used differently depending on
  provider: for Google (`google-pue`) and Microsoft
  (`msft-pue-global-fy25`) it still applies symmetrically, ± this value
  around their reported point estimate. For the default provider
  (neither Google nor Microsoft) there is no longer a single point
  estimate - min is the fact `us-dc-pue-ai-2024` (1.145, PUE of US
  facilities equipped for AI) and mid is `us-dc-pue-2024` (1.45, US
  national average); only the upper bound is still an assumption, `mid +
  pue-range-half-width` (1.55). The older fact `us-dc-pue-2023` (1.40)
  remains in `data/facts.json` as a historical figure but is no longer
  referenced by `resolvePue`.
- **withdrawal-to-consumption-share** (0.8): from the note on
  `google-wue-cat2` ("Google consumes on average 80% of the water it
  withdraws"), carried over to AWS and Meta.
- **wue-site-fallback-min/max** (0.32 / 0.4 L/kWh): hyperscale median and
  sensitivity figure from the note on `us-dc-wue-site-2023`.
- **region-fallback-confidence-cap** (2): an editorial rule that caps
  confidence when falling back to US values for an unknown region.

## Cross-check against EcoLogits

Full tables: [docs/crosscheck/results.md](crosscheck/results.md).
EcoLogits (Python, GenAI Impact, JOSS 2025) was run offline for the same
ten cases (five model families, short/long) without adjusting our
coefficients to match it. Three findings:

1. **For one real, open model with a known parameter count
   (Llama-3.1-70B-Instruct), the two systems agree to within 40%**,
   despite being methodologically completely independent (EcoLogits:
   parameter regression; ThirstyAI: benchmark facts). This is the
   strongest external confirmation ThirstyAI has so far.
2. **For all four proprietary models the values diverge by a factor of
   3-6, in both directions** - not because either system is
   miscalculating, but because EcoLogits has to estimate the parameter
   count of closed models itself (e.g. gemini-2.5-pro: 200-600 billion
   active parameters, flagged with the `model-arch-not-released` and
   `model-arch-multimodal` warnings) and its GPU energy scales linearly
   with that estimate, while ThirstyAI stays tied to measured benchmark
   ranges from the fact file.
3. **ThirstyAI's name heuristic had a documented weakness** (fixed in
   step 8, see addendum): for mistral-large-latest (really 123 billion
   parameters, according to EcoLogits/Mistral themselves - which fits
   ThirstyAI's own 'mid' boundary of <=200 billion), the name component
   "large" without an accompanying number caused it to be misclassified
   as "frontier" (anchored to a 405-billion model). A model name with an
   explicit size (like "70b" for Llama) was not affected by this.

**Addendum, step 7**: `data/models.json` has since given ThirstyAI known
parameter counts (Mistral Large 2, Llama 3.1 8B/70B/405B, Mixtral 8x22B,
DeepSeek-V3), checked before the name heuristic. The exact name
"mistral-large-2" was thereby correctly recognized as "mid" (test in
`test/models.test.ts`) - finding 3 initially remained for the alias
"mistral-large-latest" used in the cross-check, because the fact
depended on the token "2" and resolving "-latest" aliases was not part
of step 7. Clarification on the Gemini case: Google's own measured,
already-complete fullstack value (fact `gemini-energy`) applies in
ThirstyAI only to the model name "gemini-apps" (the fullstack special
case from test case 1, step 4). The name "gemini-2.5-pro" used in the
cross-check is not affected by this: it runs through the normal
"frontier" class (Monte Carlo estimate for Llama-3.1-405B), so ThirstyAI
is estimating here just as much as EcoLogits is (which for its part
assumes 200-600 billion active, Google-unconfirmed parameters) - the
Gemini finding above (2.) is an estimate-versus-estimate divergence, not
a comparison between a measured and an estimated value.

**Addendum, step 8**: `data/models.json` facts now carry an `aliases`
field (checked for uniqueness across the whole table on load).
`classifyModel` resolves in three stages: exact fact name, then alias,
only then the name heuristic. "mistral-large-latest" is recorded as an
alias of `params-mistral-large-2` and is thereby correctly classified as
"mid" - finding 3 is thus fixed for the cross-check (see the updated
results.md, mistral rows now within 25% instead of a factor of 6-8).
The confidence staffing of the name heuristic was also refined:
fact-based matches take on the fact's own confidence; a name match with
a recognized family AND a size/behavior marker (e.g. "mini", "70b",
"r1") yields confidence 2; a recognized family without a marker, or a
completely unknown name, both yield confidence 1 (previously 2 and 1,
respectively) - a family alone is not a reliable size signal. Affected
test: "falls back to frontier with confidence 2 for a known family
without a size hint" in `test/models.test.ts`, now confidence 1.

## Open issues

1. **Token mapping for scaling**: each energy fact is mapped via
   `OUTPUT_TOKENS_FOR_ENERGY_FACT` (`src/resolve.ts`) to a token fact
   that supplies the matching average output token count. With
   `basis: "measured"` (e.g. `llama31-70b-inf-energy` ->
   `mlenergy-llama31-70b-output-tokens`), the energy value and the token
   count come from the same measurement/benchmark. With
   `basis: "assumed"` (including every case mapped to an Oviedo typical
   value such as `oviedo-typical-output-tokens`, which also covers the
   fullstack fact `gemini-energy`), the token count is carried over from
   a different source; confidence is additionally capped at 2 in these
   cases (`perThousandOutputTokens()`). This supersedes the flat
   reference token count (300, the same for every calculation)
   previously documented here, but for `basis: "assumed"` cases it
   remains a similar methodological risk: the assigned token count does
   not measure the same request as the energy value.
2. **Input cost share (0.1)**: that an input token counts energetically
   as 0.1 of an output token is an assumption (prefill is
   parallelizable and therefore cheaper than sequential decoding), but
   not quantified with the facts on hand.
3. **co2Scope2 does not cover Google's full, publicly stated CO2
   figure**: for the Gemini case study, Google states 0.03 g CO2e per
   median text prompt (fact `gemini-co2`). According to the fact's note,
   that figure also includes Scope 1 (refrigerants) and Scope 3
   (hardware manufacturing), together around 0.010 g. The formula
   documented here (energy x grid emission factor) can only compute the
   Scope 2 portion (around 0.023 g). ThirstyAI therefore deliberately
   only computes `co2Scope2` and makes that visible in the field name
   and the type comment, rather than claiming a total that cannot be
   derived or expanding the project's scope to a full life-cycle
   analysis (see the project rule "no scope expansion"). ThirstyAI's
   results accordingly understate the true total CO2 balance by the
   Scope 1+3 portion.
4. **Model class "small" is only a rough lower bound**:
   `energy-small-lower-bound` (0.01 Wh) is an assumption with no
   measurement of its own; `dsr1-distill-70b-noreason` (0.0495 Wh) only
   serves as a conservative upper bound - there is no supported range in
   between. This shows up in the cross-check
   (docs/crosscheck/results.md): gpt-4o-mini comes out a consistent
   factor of 4 higher in ThirstyAI than in EcoLogits, even though both
   tools place the model in the same smallest size class - the
   difference lies in the calculation itself (ThirstyAI's overhead
   factor with no parallelism/batching model vs. EcoLogits' regression
   with batch_size=64), not in the model class, but the thin factual
   basis for the "small" class makes an independent check difficult.
