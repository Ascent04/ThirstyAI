# ThirstyAI – Frequently Asked Questions

Last updated 2026-09-09.

---

## Part 1 – What this is

### What is ThirstyAI in one sentence?
A calculator backed by a curated table of facts: you give it an AI model, an amount of generated text and a region, and it tells you roughly how much electricity, water and CO₂ that cost – as a range, not as a single number.

### Why a range instead of one number?
Because nobody knows the exact number. The providers (OpenAI, Anthropic, xAI, DeepSeek) publish no per-request figures. What exists are measurements by researchers on open models, one Google publication for Gemini, and industry studies on data centres. These sources disagree with each other by factors of two to five. A single number would hide that uncertainty; a range shows it. That is the core of this project: being honest about what isn't known.

### What exactly do "min / mid / max" mean?
- **mid** is the best available value, usually the national reference figure or the best-documented measurement.
- **min** and **max** are the smallest and largest values that credible sources give for the same quantity.
- Important: the range is a *spread between methods* ("this is how differently serious people calculate it"), not measurement uncertainty ("this is how imprecise the instrument is"). This distinction is stated explicitly because any reviewer will want to know it.

### Who is this for?
Three groups: developers who want to quantify their API usage; sustainability staff who need to get AI into a Scope 3 inventory; and journalists or curious readers who want to understand why the numbers in headlines differ so wildly.

### What it is not
Not a measuring instrument. Not a substitute for provider figures once those exist. Not a tool for evaluating individual employees. And not the truth – it is a documented, auditable calculation with its assumptions declared.

### How do you use it?
Three ways:
- **Web calculator**: a single page in the browser. Pick a model and an amount, get the result with ranges and the full list of facts used.
- **Command line**: `calc` for a single request, `session` for a whole working session.
- **Library**: call `calculate(...)` from your own TypeScript or JavaScript code.

---

## Part 2 – How the calculation works

### What is a token?
AI models split text into pieces called tokens – word fragments, short whole words, punctuation. In English and German it is roughly 1.3 tokens per word. A 750-word answer is about 1,000 tokens. Providers bill in tokens, which makes it the natural unit of quantity here.

### Why does only output count?
Because generating text (output) does most of the computational work. Reading the input text costs something too, but considerably less. ThirstyAI counts input tokens at a share of 0.1 relative to output tokens – that is an assumption, not a measurement, which is why it lives in `assumptions.json` and not in `facts.json`. That input processing is cheaper than output generation is qualitatively supported (among others by Oviedo et al. 2025); the specific factor of 0.1 is not.

### What about the cache?
When you continue a long conversation, the model does not have to reprocess the whole history every time – it holds it in a cache. Reading from cache is far cheaper than reprocessing. *How much* cheaper is the biggest open question in the model: the cache factor dominates the range for long sessions more than any other value.

### The calculation steps, in order
1. **Tokens → watt-hours at the chip.** From the fact table: Wh per 1,000 output tokens for the model in question, or for a proxy model of similar size.
2. **Chip → data centre.** Multiply by the PUE factor (Power Usage Effectiveness): how much electricity the building needs on top of the chip for cooling, power supplies, lighting. Currently 1.145 (modern AI data centres) to 1.45 (US average across all data centres).
3. **Electricity → on-site water (Scope 1).** Cooling towers evaporate water. The factor (litres per kWh) applies to chip power, not building power – a detail that has to sit correctly in the code, and does.
4. **Electricity → water at the power plant (Scope 2).** Power plants need cooling water too. Regional factors.
5. **Electricity → CO₂.** Regional grid mix: France (nuclear) very low, Germany medium, India high. For 2024 there are three values per region (min/mid/max) from different databases (UBA, Ember, EEA, eGRID).
6. **Output** as a range with reference year, fact IDs and confidence ratings.

### What is the "overhead factor"?
Most published measurements cover only the graphics chip (GPU), not the whole server with its CPU, memory, networking and storage. The overhead factor converts from one boundary to the other; it lies between 1.7 and 2.4. It is an assumption, not a measurement – and because it appears in nearly every calculation, it is what caps the method confidence (see below).

### What are "Scope 1" and "Scope 2" for water?
Terms borrowed from carbon accounting and applied to water: Scope 1 is direct and on site (data centre cooling), Scope 2 is indirect via electricity generation (power plant cooling). Together they make up the water footprint.

### Why is there a reference year?
Because the grid mix changes every year. The CO₂ table is organised by year; today it holds the 2024 row. Anyone wanting to calculate for 2025 has to wait until all sources publish their 2025 figures (Ember has, EEA and eGRID have not). An unknown year raises an error rather than quietly using the wrong one.

---

## Part 3 – The data: where it comes from, how it is checked, how certain it is

### Where do the numbers come from?
Scientific publications (arXiv preprints and peer-reviewed papers), government data (German Environment Agency, EEA, US EPA eGRID), industry studies (Lawrence Berkeley National Laboratory on US data centres), provider disclosures (Google, Meta model cards) and databases (Ember via Our World in Data).

### How many facts are there?
Two numbers that need to be kept apart:
- **`facts.json` alone**: 122 facts from 26 sources – everything that appears in an external source.
- **The assembled table** actually used for calculation: 142 facts from 34 sources. The difference is the assumptions from `assumptions.json` and the model classifications from `models.json`.

The web calculator shows the second number, because that is the table doing the arithmetic.

### How confident can you be in data from the web? Is it verified?
That is the right question, and the answer is a procedure, not a promise:

1. **Primary sources only.** No value comes from a blog post, a summary or a headline. If a value appears in an article, the original source cited there is opened and the value looked up in it. If it isn't there, it doesn't enter the table.
2. **Every source was actually opened.** Not "is well known", but: PDF downloaded, page read, table located, value transcribed. Each fact's `verified` field records when and by whom. A fact without that field is invalid.
3. **Rating by strength of evidence.** Every fact carries one of three ratings: BESTÄTIGT (confirmed – primary source plus an independent second source), EINZELQUELLE (single source – one credible source, no confirmation), UMSTRITTEN (disputed – credible sources contradict each other). Plus a confidence rating from 1 to 5. Anything merely estimated is labelled ANNAHME (assumption) and lives in a separate file.
4. **Context is recorded alongside.** A measurement without its boundary is worthless: "GPU-only" (the chip alone) and "full stack" (the whole data centre) differ by a factor of 1.7 to 2.4. Every fact carries its measurement boundary so that nothing gets compared across incompatible boundaries.
5. **Negative findings are recorded.** When a provider publishes nothing, that is entered as a fact in the table, with the date it was checked. This makes visible what was looked for and not found – and when it is worth checking again.
6. **Values are never overwritten.** When a new number arrives, a new fact is created; the old one stays. Any past calculation can be reproduced.
7. **Two-person rule.** Researching and verifying a source is one role; entering it into the file is another. Whoever enters does not verify their own work – and records that fact in the `verified` field.

So how confident should you be? As confident as the best available source, and the rating tells you how good that is. When you see UMSTRITTEN or a confidence of 2, you know: the range is wide here because the world does not know better – not because the tool was sloppy.

### What do "data confidence" and "method confidence" mean?
Two separate ratings, each from 1 to 5:

- **Data confidence** is the weakest *evidenced* source that went into this particular calculation. It tells you how good the underlying data is.
- **Method confidence** is the weakest *assumption* that went into it. It tells you how sound the calculation is where no source exists.

The split is necessary because a single rating would mislead. The overhead factor is an assumption rated 1 and appears in nearly every calculation – so a combined rating would be 1 almost always, no matter how good the sources are. Split apart, you can see that the sourcing may sit at 4 while the method sits at 1. Both numbers together with the fact list below them let you recompute the ratings yourself.

### What is the difference between `facts.json` and `assumptions.json`?
`facts.json` holds everything that appears in a source (ratings BESTÄTIGT, EINZELQUELLE, UMSTRITTEN). `assumptions.json` holds everything the project had to set itself because no source exists – the input share of 0.1, the cache factor, the overhead factor. The separation is a rule: file follows rating. That way a reviewer can see immediately where evidence ends and estimation begins. On the web calculator this corresponds to the two separate tables below the result.

### How does new data get in?
The process is called an addendum and runs in cycles: research (open sources, find values, assign a rating, file the finding), review (is the source credible, is the rating right, does the value belong here?), transfer (create new facts, assign IDs, set the `verified` field), and use (only once the fact is in does anyone decide whether and how the code uses it – with a prediction of the numerical effect).

### How often does it need updating?
Grid mix: annually, when the agencies publish (spring to autumn of the following year). Model measurements: whenever new studies appear, worth checking roughly quarterly. Negative findings: repeat on their recorded check date. There is no calendar for this yet – that would be a useful addition.

### What is the EcoLogits cross-check?
EcoLogits is a French open-source project attempting the same thing as ThirstyAI, with a different method. The cross-check runs the same examples through both and compares. If the orders of magnitude agree, that is independent corroboration; if they diverge, you learn where the methods part ways. The most recent run is out of date, because the token unit and the PUE/CO₂ intervals have changed since.

---

## Part 4 – Use in a company

### What does this do for a carbon inventory?
AI usage belongs in Scope 3 (purchased services). Until now it has been missing there, or buried in a flat cloud allocation, because providers supply no figures. ThirstyAI enables the calculation "quantity × documented emission factor" – the same shape as electricity or vehicle fleets – with the bandwidth declared. That is auditable; an invented single number is not.

### Where do the token counts come from, without reading anyone's chats?
From billing. Every corporate contract (Azure OpenAI, Microsoft Copilot, Anthropic Enterprise, Google) has an admin console with usage statistics: tokens per month, per model, per department. The invoice export lists input, output and cache tokens. Fallback without an export: invoice amount divided by list price per million tokens. Nobody sees any content in the process.

### What about data protection?
Usage volumes per person are personal data too. So: obtain clearance before the first analysis, aggregate at department or group level, never per employee.

### Can I measure a ChatGPT conversation?
Estimate it, yes – with two caveats. OpenAI publishes nothing, so ThirstyAI calculates via proxy models of similar size. And the ChatGPT interface shows no token counts; you estimate from the word count (× 1.3) or export the conversation. Order of magnitude: a 300-word answer sits at roughly 0.3–3 Wh of electricity (charging a phone: 10–15 Wh) and a few millilitres of water. The width of that range is the point.

### What happens when providers eventually publish real figures?
California (SB 253) requires large companies to disclose from late 2026. At that point the provider's figure is entered as a new fact (BESTÄTIGT or EINZELQUELLE), the code points to it, and the proxy facts remain as history. The method does not change – only the range gets narrower.

---

## Part 5 – Known gaps (stated plainly)

- **Long context.** The per-token energy figures come from short-context benchmarks. In sessions with 300,000+ tokens of context, consumption per output token is systematically higher. Documented, not solved.
- **The overhead factor** is an assumption and caps method confidence at 1 in practically every calculation.
- **The cache factor** is an assumption and dominates the range for long sessions.
- **The input share of 0.1** is an assumption, supported only qualitatively.
- **Power plant water** comes largely from the 2015 data year; for several countries two sources give diverging values.
- **India, Japan**: only one CO₂ source each, so min = mid = max.
- **Provider negative findings** need re-checking periodically.
- **No calendar** for source updates.
