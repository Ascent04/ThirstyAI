# Gegenprobe gegen EcoLogits

Vergleicht ThirstyAIs Ergebnisse mit [EcoLogits](https://ecologits.ai/)
(Python, GenAI Impact, peer-reviewed JOSS 2025) fuer dieselben zehn
Faelle. Ziel ist nicht, wer "richtig" liegt, sondern zu dokumentieren, wo
und warum die Ergebnisse auseinanderliegen. Siehe [results.md](results.md)
fuer die Vergleichstabellen und den Absatz "Gegenprobe" in
[../methodology-draft.md](../methodology-draft.md) fuer die Kurzfassung.

## Schritt 1: EcoLogits installieren und pruefen

- Python 3.11.2 (Debian 12), venv unter `.venv/` (nicht in git).
- `pip install ecologits` → Version 0.11.1.
- EcoLogits bietet eine dokumentierte Offline-Funktion ohne echten
  API-Aufruf: `ecologits.tracers.utils.llm_impacts(provider, model_name,
  output_token_count, request_latency, electricity_mix_zone)`. Sie zieht
  Modell- (Parameterzahl) und Netzdaten aus EcoLogits' eigenem
  Repository (`ecologits/data/models.json`,
  `ecologits/data/electricity_mixes.json`) - kein Client, kein Netzwerk.
- Bekannte Modellnamen je Familie (Auszug, `ecologits.model_repository.models`):
  - **openai**: gpt-4o, gpt-4o-mini, gpt-4.1(-mini/-nano), gpt-5.x, o1, o3-mini, o4-mini, ...
  - **anthropic**: claude-sonnet-4-5, claude-opus-4-x, claude-haiku-4-5, ...
  - **google_genai**: gemini-2.0/2.5/3.x-flash/pro, gemma-4-*, ...
  - **huggingface_hub**: Llama laeuft hier, nicht als eigene "llama"-Familie,
    z.B. `meta-llama/Meta-Llama-3.1-70B-Instruct` (dense, 70.55 Mrd. Parameter,
    real bekannt, keine Schaetzung).
  - **mistralai**: mistral-large-latest, mistral-small-*, codestral-*, ...

## Ausfuehrung

```bash
.venv/bin/python scripts/crosscheck_ecologits.py     # -> ecologits.json
npm run build
npx tsc scripts/crosscheck_thirstyai.ts --module NodeNext \
  --moduleResolution NodeNext --target ES2022 --outDir scripts --skipLibCheck
node scripts/crosscheck_thirstyai.js                 # -> thirstyai.json
.venv/bin/python scripts/crosscheck_report.py         # -> results.md
```

`scripts/crosscheck_thirstyai.js` ist ein Build-Artefakt (in
`.gitignore`), nur die `.ts`-Quelle ist versioniert.

## Latenz-Annahme

EcoLogits braucht eine Latenz (Sekunden) fuer sein GPU-Auslastungsmodell.
Da keine echte Anfrage gestellt wird, gibt es keine gemessene Latenz -
ANNAHME: 1 Sekunde pro 100 Output-Token. Bei Modellen mit einem
hinterlegten `deployment`-Profil (z.B. claude-sonnet-4-5: tps=32.2,
ttft=1.33s) nutzt EcoLogits intern `min(unsere Annahme, aus tps/ttft
berechnete Latenz)` (`ecologits/impacts/llm.py:generation_latency`) -
unsere Annahme wirkt dort als Obergrenze, nicht als alleiniger Wert.
