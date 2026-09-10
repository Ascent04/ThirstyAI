# Glossary

A reference for the terms used in ThirstyAI, in the fact table and on the calculator page. Meant for jumping into, not for reading front to back.

Last updated 2026-09-10.

---

## Part 1 — Terms of the method

These appear verbatim in the fact table and on the calculator page. Knowing them is necessary to interpret the numbers.

### Fact
A single value from a verified source, carrying an ID, a unit, a measurement boundary, a rating and a source reference. Facts live in `data/facts.json`.

### Assumption
A value the project had to set itself because no source exists. Assumptions live separately in `data/assumptions.json` and carry the rating ANNAHME. The separation is a rule: file follows rating.

### Rating
The strength of evidence behind a fact. The values appear in German in the data, because that is how they are stored:

- **BESTÄTIGT** (confirmed) — primary source plus an independent second source.
- **EINZELQUELLE** (single source) — one credible source, no confirmation.
- **UMSTRITTEN** (disputed) — several credible sources disagree on the same quantity.
- **ANNAHME** (assumption) — no source; set by the project.

### Confidence
A number from 1 to 5 per fact. It judges how dependable that individual value is, independently of the rating. A BESTÄTIGT fact can still carry a low confidence if the source itself declares uncertainties.

### Data confidence
The weakest confidence among the **evidenced** facts that went into a particular calculation. It says: this is how good the data is for this result.

### Method confidence
The weakest confidence among the **assumptions** that went in. It says: this is how sound the calculation is where no source exists. It sits at 1 almost always, because the overhead factor appears in nearly every calculation.

### Measurement boundary
What a value includes and what it leaves out. The single most important piece of context: an energy figure for "the graphics chip alone" and one for "the whole data centre" differ by a factor of 1.7 to 2.4, even though both are called "watt-hours per query".

### System boundary
The same principle one level up: which phases of a model's life are counted? ThirstyAI covers running operation only. Training, hardware manufacturing and data centre construction are excluded.

### Range (min / mid / max)
Three values instead of one. **mid** is the best-evidenced value; **min** and **max** are the extremes that credible sources give for the same quantity. The range reflects how differently credible people calculate — it is not measurement uncertainty.

### Negative finding
The recorded observation that a provider has published nothing, with the date it was checked. This makes visible what was looked for and not found.

### Addendum
The process by which new data enters the table: research, review, transfer, and only then use in the code.

### verified
The field recording when and by whom a source was actually opened and the value looked up in it. A fact without this field is invalid.

### second_source
The independent second source confirming a value. It is the precondition for the rating BESTÄTIGT.

### Cross-check
A fact deliberately **not** used in the calculation, kept for comparison — such as Mistral's life cycle assessment, which covers a different life cycle than ThirstyAI.

### Proxy model
When no measurement exists for a model (GPT or Claude, for instance, because the providers publish nothing), ThirstyAI calculates via an open model of similar size.

---

## Part 2 — Terms of the subject

### Token
The unit AI models split text into — word fragments, short words, punctuation. Roughly 1.3 tokens per word in English and German. Providers bill in tokens.

### Input and output tokens
Input is the text the model reads; output is the text it generates. Output costs considerably more computation.

### Prefill and decoding
The two phases of a request. **Prefill** processes the input in one pass. **Decoding** produces the answer token by token and cannot be parallelised — which is why it dominates consumption.

### Cache
The store where a model keeps the conversation so far, so it need not reprocess it on every request. How much computation this saves is the biggest open question in the model.

### PUE — Power Usage Effectiveness
Total data centre electricity divided by the electricity reaching the computing equipment. 1.0 would be lossless. Modern AI data centres sit around 1.145; the US average across all data centres is 1.45.

### WUE — Water Usage Effectiveness
Litres of water a data centre evaporates on site per kilowatt-hour of IT electricity. Cooling towers evaporate water.

### EWIF — Electricity Water Intensity Factor
Litres of water per kilowatt-hour arising from **electricity generation** — power plant cooling and evaporation from hydropower reservoirs. Varies widely by region.

### Scope 1, 2 and 3
Terms from carbon accounting, applied here to water as well:

- **Scope 1** — direct and on site. For a data centre: the cooling.
- **Scope 2** — indirect, via purchased electricity. For water: power plant cooling.
- **Scope 3** — everything else in the value chain. A company's AI usage belongs here.

### Withdrawal and consumption
**Withdrawal** is all water taken from a body of water, including what flows back. **Consumption** is only the part that evaporates and is permanently removed. The two differ by orders of magnitude for thermal power generation. ThirstyAI works with consumption.

### Market-based and location-based
Two ways of determining the carbon content of electricity. **Location-based** uses the actual grid mix. **Market-based** factors in contracts and certificates, and therefore comes out lower for companies with renewable supply contracts. ThirstyAI works location-based.

### GPU-only and full stack
**GPU-only** measures the graphics chip alone. **Full stack** measures the entire server including CPU, memory, networking and the data centre around it. Most published measurements are GPU-only.

### Overhead factor
The number used to convert from GPU-only to full stack. It lies between 1.7 and 2.4. An assumption, not a measurement — and the reason method confidence is almost always 1.

### Life cycle assessment (LCA)
An assessment under ISO 14040/44 covering every phase of a product's life: raw material extraction, manufacturing, use, end of life. Considerably broader than ThirstyAI's operational calculation.

### ADP — Abiotic Resource Depletion
A measure of non-renewable resource use, standardised to antimony equivalent.

### Grid mix
The composition of a region's electricity generation by source. It determines both carbon content and power plant water.

### Reference year
The year a grid mix applies to. It changes annually; a calculation without a reference year cannot be audited.

---

## Part 3 — Abbreviations

- **ADEME** — French environment and energy agency
- **ADP** — Abiotic Resource Depletion
- **CSRD** — EU Corporate Sustainability Reporting Directive
- **EEA** — European Environment Agency
- **eGRID** — US EPA emissions database
- **EWIF** — Electricity Water Intensity Factor
- **GWP100** — Global Warming Potential over 100 years
- **LBNL** — Lawrence Berkeley National Laboratory
- **LCA** — Life Cycle Assessment
- **LLM** — Large Language Model
- **PUE** — Power Usage Effectiveness
- **SB 253** — California disclosure law
- **UBA** — German Environment Agency
- **WCP** — Water Consumption Potential
- **WRI** — World Resources Institute
- **WUE** — Water Usage Effectiveness
- **Wh / kWh** — watt-hour, kilowatt-hour
- **gCO₂e** — grams of CO₂ equivalent
- **L/kWh** — litres per kilowatt-hour, identical to m³/MWh
