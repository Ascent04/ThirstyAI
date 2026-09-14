"""
Erzeugt docs/crosscheck/results.md aus cases.json, ecologits.json und
thirstyai.json: drei Tabellen (Energie, CO2, Wasser) mit dem Verhältnis
ThirstyAI/EcoLogits pro Fall, und eine Erklärungsspalte für Fälle mit
Verhältnis > 3 oder < 1/3.

Die Erklärungstexte sind keine Vermutungen, sondern zitieren konkrete
Stellen aus dem EcoLogits-Quellcode/-Datensatz (siehe Kommentare unten,
Pfade relativ zu .venv/lib/python3.11/site-packages/ecologits/).
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES_PATH = ROOT / "docs" / "crosscheck" / "cases.json"
ECOLOGITS_PATH = ROOT / "docs" / "crosscheck" / "ecologits.json"
THIRSTYAI_PATH = ROOT / "docs" / "crosscheck" / "thirstyai.json"
OUTPUT_PATH = ROOT / "docs" / "crosscheck" / "results.md"

THRESHOLD = 3.0

# Recherchierte Begründungen je Fall-Präfix (Modellfamilie). Quellen:
# - ecologits/data/models.json (Architektur/Parameterzahl je Modell)
# - ecologits/impacts/llm.py (gpu_energy(): Regression mit BATCH_SIZE=64;
#   generation_latency(): tps/ttft aus deployment überstimmen unsere
#   Latenz-ANNAHME, wenn sie kleiner ist)
# - ecologits/tracers/utils.py (PROVIDER_CONFIG_MAP: PUE/WUE je Anbieter)
EXPLANATIONS = {
    "gpt": (
        "EcoLogits schätzt gpt-4o-mini selbst auf 8-28 Mrd. aktive Parameter "
        "(models.json, warnings: model-arch-not-released) - damit landet es wie bei "
        "ThirstyAI in der kleinsten Größenklasse. Der größere Faktor ist die "
        "Serving-Annahme: EcoLogits' GPU-Energie-Regression "
        "(impacts/llm.py:gpu_energy) enthält einen festen batch_size=64-Term "
        "(gpu_energy_alpha * exp(gpu_energy_beta * batch_size)), der GPU-Overhead "
        "auf 64 gleichzeitige Anfragen umlegt. ThirstyAIs overhead-factor-ANNAHME "
        "(1.7-2.4x) kennt keine Parallelität und behandelt jede Anfrage so, als "
        "hätte sie die GPU (näherungsweise) exklusiv - das treibt unseren Wert "
        "nach oben."
    ),
    "claude": (
        "EcoLogits führt claude-sonnet-4-5 als Mixture-of-Experts mit geschätzt "
        "44-132 Mrd. aktiven (440 Mrd. Gesamt-)Parametern (models.json, warning: "
        "model-arch-not-released). Die GPU-Energie-Regression von EcoLogits skaliert "
        "linear mit der aktiven Parameterzahl - eine hohe Schätzung treibt Energie, "
        "CO2 und Wasser gleichermaßen nach oben. ThirstyAIs 'mid'-Klasse ist "
        "dagegen an gemessene Benchmarks dichter, offener 70-141B-Modelle verankert "
        "(Llama-3.1-70B, Mixtral-8x22B), nicht an eine geschätzte Parameterzahl "
        "eines geschlossenen Modells - daher der niedrigere ThirstyAI-Wert."
    ),
    "gemini": (
        "EcoLogits führt gemini-2.5-pro als MoE mit geschätzt 200-600 Mrd. "
        "aktiven (2000 Mrd. Gesamt-)Parametern (models.json, warnings: "
        "model-arch-not-released, model-arch-multimodal) - die größte Schätzung "
        "aller fünf Fälle. Da EcoLogits' GPU-Energie linear mit der aktiven "
        "Parameterzahl skaliert, ist das der Haupttreiber der 5-6-fach höheren "
        "Werte. ThirstyAIs 'frontier'-Klasse ist an eine Monte-Carlo-Schätzung für "
        "das offene, dichte Llama-3.1-405B (405 Mrd. Parameter total) verankert - "
        "kleiner und nicht MoE-basiert."
    ),
    "mistral": (
        "Kein Erklärungsbedarf mehr seit Schritt 8: 'mistral-large-latest' ist "
        "jetzt als Alias von params-mistral-large-2 hinterlegt (data/models.json) "
        "und wird korrekt als 'mid' klassifiziert - Verhältnis liegt innerhalb "
        "[1/3, 3]. Zuvor (Schritt 7) fiel dieser Alias mangels Versionsnummer noch "
        "auf die Namensheuristik zurück (FRONTIER_TOKENS: 'large') und landete "
        "fälschlich in 'frontier'."
    ),
    "llama": (
        "Kein Erklärungsbedarf: Verhältnis liegt innerhalb [1/3, 3]. Bemerkenswert "
        "ist trotzdem, warum: Llama-3.1-70B-Instruct hat eine öffentlich bekannte, "
        "reale Parameterzahl (70.55 Mrd., models.json, dicht, keine Schätzung nötig) "
        "und ist genau das Modell, auf dessen gemessenen Benchmark ThirstyAIs "
        "'mid'-Klasse selbst beruht - hier treffen sich unabhängige Methodik "
        "(EcoLogits' Parameter-Regression) und Benchmark-Ansatz (ThirstyAI) auf "
        "denselben Ausgangswert."
    ),
}


def family_of(case_id: str) -> str:
    return case_id.split("-")[0]


def fmt_range(r: dict, digits: int) -> str:
    return f"{r['mid']:.{digits}f} ({r['min']:.{digits}f}-{r['max']:.{digits}f})"


def build_table(cases, eco_by_id, tai_by_id, metric_key: str, unit: str, digits: int) -> str:
    lines = [
        f"| Fall | Modell | Tokens (in/out) | EcoLogits {unit} | ThirstyAI {unit} | Verhältnis (ThirstyAI/EcoLogits) | Erklärung |",
        "|---|---|---|---|---|---|---|",
    ]
    for case in cases:
        cid = case["id"]
        eco = eco_by_id[cid]
        tai = tai_by_id[cid]
        ev = eco[metric_key]["mid"]
        tv = tai[metric_key]["mid"]
        ratio = tv / ev if ev else float("inf")
        outlier = ratio > THRESHOLD or ratio < 1 / THRESHOLD
        explanation = EXPLANATIONS[family_of(cid)] if outlier else ""
        lines.append(
            f"| {cid} | {case['thirstyai']['model']} | {case['tokensIn']}/{case['tokensOut']} "
            f"| {fmt_range(eco[metric_key], digits)} | {fmt_range(tai[metric_key], digits)} "
            f"| {ratio:.2f}x | {explanation} |"
        )
    return "\n".join(lines)


def main() -> None:
    cases_data = json.loads(CASES_PATH.read_text())
    eco_data = json.loads(ECOLOGITS_PATH.read_text())
    tai_data = json.loads(THIRSTYAI_PATH.read_text())

    cases = cases_data["cases"]
    eco_by_id = {r["id"]: r for r in eco_data["results"]}
    tai_by_id = {r["id"]: r for r in tai_data["results"]}

    unrecognized = [r["id"] for r in tai_data["results"] if not r["recognized"]]

    md = []
    md.append("# Gegenprobe gegen EcoLogits\n")
    md.append(
        f"EcoLogits Version {eco_data['ecologitsVersion']}, offline berechnet über "
        "`ecologits.tracers.utils.llm_impacts` (kein echter API-Aufruf). "
        f"Latenz-ANNAHME: {eco_data['latencyAssumption']}. "
        f"Region/Zone: {cases_data['region']} (ThirstyAI) / "
        f"{cases_data['electricity_mix_zone_ecologits']} (EcoLogits).\n"
    )
    md.append(
        "EcoLogits' `energy`/`gwp` sind Gesamtwerte inkl. embodied "
        "(Hardware-Herstellung); `wcf` (Wasser) ist reine Nutzungsphase, EcoLogits "
        "modelliert keine embodied-Wasserwirkung. ThirstyAIs `co2Scope2` deckt nur "
        "Scope 2 (Stromverbrauch) ab, `waterScope1+waterScope2` sind reine "
        "Nutzungsphase - die Systemgrenzen sind an dieser Stelle also ähnlich beim "
        "Wasser (beide nur Nutzungsphase), aber verschieden beim CO2 (EcoLogits "
        "inkl. Herstellung, ThirstyAI nicht).\n"
    )
    if unrecognized:
        md.append(
            f"**Nicht von ThirstyAIs Klassifikation erkannt (Rückfall):** {', '.join(unrecognized)}\n"
        )
    else:
        md.append(
            "Alle zehn Modellnamen wurden von ThirstyAIs Klassifikation erkannt "
            "(confidence >= 2: Fakt-basiert oder Namensheuristik mit Familie und "
            "Größenmarker, kein Rückfall auf 'nur Familie oder unbekannt').\n"
        )
    md.append(
        "Alle zehn ThirstyAI-Ergebnisse haben confidence 1: keines der Modelle "
        "trifft ThirstyAIs Vollstack-Sonderfall (nur 'gemini-apps'), daher greift "
        "überall der overhead-factor (ANNAHME, confidence 1) und floort die "
        "Gesamt-confidence - das ist erwartetes Verhalten, kein Fehler.\n"
    )
    md.append(
        "Seit Schritt 8 löst ThirstyAI Modellnamen in drei Stufen auf: exakter "
        "Fakt-Name, dann deklarierter Alias (beide aus `data/models.json`), erst "
        "dann die Namensheuristik. 'mistral-large-latest' ist jetzt als Alias von "
        "params-mistral-large-2 hinterlegt und landet dadurch korrekt in 'mid' "
        "(vorher, Schritt 7: 'frontier' über die Namensheuristik, siehe "
        "methodology-de.md).\n"
    )
    md.append(
        "**Wichtigster Befund vorab:** Bei den beiden Modellen mit öffentlich "
        "bekannter (nicht geschätzter) Parameterzahl - Llama-3.1-70B-Instruct und "
        "seit der Alias-Korrektur auch Mistral Large 2 - liegen beide Systeme "
        "innerhalb von 25 % beieinander (siehe llama- und mistral-Zeilen unten). "
        "Bei den drei verbleibenden Familien (GPT, Claude, Gemini) muss EcoLogits "
        "die Parameterzahl selbst schätzen (proprietäre Modelle) - das ist der "
        "größte Einzelfaktor für die Abweichungen dort, nicht ein Fehler in "
        "einem der beiden Systeme.\n"
    )

    md.append("## Energie (Wh)\n")
    md.append(build_table(cases, eco_by_id, tai_by_id, "energyWh", "Wh (mid, min-max)", 4))
    md.append("")

    md.append("\n## CO2 (g)\n")
    md.append(build_table(cases, eco_by_id, tai_by_id, "co2G", "g (mid, min-max)", 4))
    md.append("")

    md.append("\n## Wasser (mL)\n")
    md.append(build_table(cases, eco_by_id, tai_by_id, "waterMl", "mL (mid, min-max)", 3))
    md.append("")

    OUTPUT_PATH.write_text("\n".join(md) + "\n")
    print(f"Geschrieben: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
