"""
Ruft EcoLogits offline (ohne echten API-Aufruf) fuer jeden Fall aus
docs/crosscheck/cases.json auf und schreibt docs/crosscheck/ecologits.json.

Verwendet ecologits.tracers.utils.llm_impacts(provider, model_name,
output_token_count, request_latency, electricity_mix_zone) - die
dokumentierte High-Level-Funktion, die Modell- und Netz-Fakten aus
EcoLogits' eigenem Repository zieht, ohne einen Client/eine echte
Anfrage zu brauchen.

EcoLogits braucht eine Latenz (Sekunden), um die GPU-Auslastung zu
schaetzen. Da wir keine echte Anfrage stellen, gibt es keine gemessene
Latenz - ANNAHME: 1 Sekunde pro 100 Output-Token (siehe
docs/crosscheck/README.md).
"""

import importlib.metadata
import json
from pathlib import Path

from ecologits.tracers.utils import llm_impacts

ROOT = Path(__file__).resolve().parent.parent
CASES_PATH = ROOT / "docs" / "crosscheck" / "cases.json"
OUTPUT_PATH = ROOT / "docs" / "crosscheck" / "ecologits.json"

LATENCY_SECONDS_PER_100_OUTPUT_TOKENS = 1.0


def latency_seconds(tokens_out: int) -> float:
    return tokens_out / 100.0 * LATENCY_SECONDS_PER_100_OUTPUT_TOKENS


def value_or_range(value) -> dict:
    if hasattr(value, "min") and hasattr(value, "max"):
        return {"min": value.min, "mid": (value.min + value.max) / 2, "max": value.max}
    return {"min": value, "mid": value, "max": value}


def kwh_to_wh(v: dict) -> dict:
    return {k: x * 1000 for k, x in v.items()}


def kg_to_g(v: dict) -> dict:
    return {k: x * 1000 for k, x in v.items()}


def l_to_ml(v: dict) -> dict:
    return {k: x * 1000 for k, x in v.items()}


def main() -> None:
    data = json.loads(CASES_PATH.read_text())
    zone = data["electricity_mix_zone_ecologits"]
    results = []

    for case in data["cases"]:
        eco = case["ecologits"]
        latency = latency_seconds(case["tokensOut"])

        impacts = llm_impacts(
            provider=eco["provider"],
            model_name=eco["model"],
            output_token_count=case["tokensOut"],
            request_latency=latency,
            electricity_mix_zone=zone,
        )

        if impacts.has_errors:
            results.append({
                "id": case["id"],
                "errors": [e.message for e in impacts.errors],
            })
            continue

        results.append({
            "id": case["id"],
            "provider": eco["provider"],
            "model": eco["model"],
            "tokensIn": case["tokensIn"],
            "tokensOut": case["tokensOut"],
            "requestLatencySeconds": latency,
            "energyWh": kwh_to_wh(value_or_range(impacts.energy.value)),
            "co2G": kg_to_g(value_or_range(impacts.gwp.value)),
            "waterMl": l_to_ml(value_or_range(impacts.wcf.value)),
            "co2GEmbodiedOnly": kg_to_g(value_or_range(impacts.embodied.gwp.value)),
            "co2GUsageOnly": kg_to_g(value_or_range(impacts.usage.gwp.value)),
            "warnings": [w.code for w in impacts.warnings] if impacts.warnings else [],
        })

    output = {
        "ecologitsVersion": importlib.metadata.version("ecologits"),
        "latencyAssumption": "1 s pro 100 Output-Token (ANNAHME, keine gemessene Latenz vorhanden)",
        "notes": {
            "energyWh": "Gesamtenergie inkl. embodied (Hardware-Herstellung), aus EcoLogits Impacts.energy",
            "co2G": "Gesamt-GWP inkl. embodied (Hardware-Herstellung), aus EcoLogits Impacts.gwp",
            "waterMl": "Nur Nutzungsphase (Strom + Kuehlung), EcoLogits modelliert keine embodied-Wasserwirkung",
        },
        "results": results,
    }
    OUTPUT_PATH.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"Geschrieben: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
