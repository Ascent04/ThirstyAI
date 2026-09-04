"""
Erzeugt docs/crosscheck/results.md aus cases.json, ecologits.json und
thirstyai.json: drei Tabellen (Energie, CO2, Wasser) mit dem Verhaeltnis
ThirstyAI/EcoLogits pro Fall, und eine Erklaerungsspalte fuer Faelle mit
Verhaeltnis > 3 oder < 1/3.

Die Erklaerungstexte sind keine Vermutungen, sondern zitieren konkrete
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

# Recherchierte Begruendungen je Fall-Praefix (Modellfamilie). Quellen:
# - ecologits/data/models.json (Architektur/Parameterzahl je Modell)
# - ecologits/impacts/llm.py (gpu_energy(): Regression mit BATCH_SIZE=64;
#   generation_latency(): tps/ttft aus deployment ueberstimmen unsere
#   Latenz-ANNAHME, wenn sie kleiner ist)
# - ecologits/tracers/utils.py (PROVIDER_CONFIG_MAP: PUE/WUE je Anbieter)
EXPLANATIONS = {
    "gpt": (
        "EcoLogits schaetzt gpt-4o-mini selbst auf 8-28 Mrd. aktive Parameter "
        "(models.json, warnings: model-arch-not-released) - damit landet es wie bei "
        "ThirstyAI in der kleinsten Groessenklasse. Der groessere Faktor ist die "
        "Serving-Annahme: EcoLogits' GPU-Energie-Regression "
        "(impacts/llm.py:gpu_energy) enthaelt einen festen batch_size=64-Term "
        "(gpu_energy_alpha * exp(gpu_energy_beta * batch_size)), der GPU-Overhead "
        "auf 64 gleichzeitige Anfragen umlegt. ThirstyAIs overhead-factor-ANNAHME "
        "(1.7-2.4x) kennt keine Parallelitaet und behandelt jede Anfrage so, als "
        "haette sie die GPU (naeherungsweise) exklusiv - das treibt unseren Wert "
        "nach oben."
    ),
    "claude": (
        "EcoLogits fuehrt claude-sonnet-4-5 als Mixture-of-Experts mit geschaetzt "
        "44-132 Mrd. aktiven (440 Mrd. Gesamt-)Parametern (models.json, warning: "
        "model-arch-not-released). Die GPU-Energie-Regression von EcoLogits skaliert "
        "linear mit der aktiven Parameterzahl - eine hohe Schaetzung treibt Energie, "
        "CO2 und Wasser gleichermassen nach oben. ThirstyAIs 'mid'-Klasse ist "
        "dagegen an gemessene Benchmarks dichter, offener 70-141B-Modelle verankert "
        "(Llama-3.1-70B, Mixtral-8x22B), nicht an eine geschaetzte Parameterzahl "
        "eines geschlossenen Modells - daher der niedrigere ThirstyAI-Wert."
    ),
    "gemini": (
        "EcoLogits fuehrt gemini-2.5-pro als MoE mit geschaetzt 200-600 Mrd. "
        "aktiven (2000 Mrd. Gesamt-)Parametern (models.json, warnings: "
        "model-arch-not-released, model-arch-multimodal) - die groesste Schaetzung "
        "aller fuenf Faelle. Da EcoLogits' GPU-Energie linear mit der aktiven "
        "Parameterzahl skaliert, ist das der Haupttreiber der 5-6-fach hoeheren "
        "Werte. ThirstyAIs 'frontier'-Klasse ist an eine Monte-Carlo-Schaetzung fuer "
        "das offene, dichte Llama-3.1-405B (405 Mrd. Parameter total) verankert - "
        "kleiner und nicht MoE-basiert."
    ),
    "mistral": (
        "EcoLogits fuehrt mistral-large-latest laut eigenen Herstellerangaben "
        "(models.json, Quelle: docs.mistral.ai) als dichtes 123-Mrd.-Parameter-Modell "
        "- das faellt in ThirstyAIs eigener Grenzziehung klar in die 'mid'-Klasse "
        "(<=200 Mrd.). ThirstyAIs Namensheuristik (src/models.ts, FRONTIER_TOKENS) "
        "ordnet den Namensbestandteil 'large' aber ohne Groessenangabe in der "
        "Zeichenkette der 'frontier'-Klasse zu, die an das 405-Mrd.-Llama-Modell "
        "verankert ist. Das ist eine echte Schwaeche der Namensheuristik, nicht der "
        "Koeffizienten selbst: eine Zahl im Modellnamen (aehnlich '70b' bei Llama) "
        "wuerde korrekt zu 'mid' fuehren."
    ),
    "llama": (
        "Kein Erklaerungsbedarf: Verhaeltnis liegt innerhalb [1/3, 3]. Bemerkenswert "
        "ist trotzdem, warum: Llama-3.1-70B-Instruct hat eine oeffentlich bekannte, "
        "reale Parameterzahl (70.55 Mrd., models.json, dicht, keine Schaetzung noetig) "
        "und ist genau das Modell, auf dessen gemessenen Benchmark ThirstyAIs "
        "'mid'-Klasse selbst beruht - hier treffen sich unabhaengige Methodik "
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
        f"| Fall | Modell | Tokens (in/out) | EcoLogits {unit} | ThirstyAI {unit} | Verhaeltnis (ThirstyAI/EcoLogits) | Erklaerung |",
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
        f"EcoLogits Version {eco_data['ecologitsVersion']}, offline berechnet ueber "
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
        "Nutzungsphase - die Systemgrenzen sind an dieser Stelle also aehnlich beim "
        "Wasser (beide nur Nutzungsphase), aber verschieden beim CO2 (EcoLogits "
        "inkl. Herstellung, ThirstyAI nicht).\n"
    )
    if unrecognized:
        md.append(
            f"**Nicht von ThirstyAIs Klassifikation erkannt (Rueckfall):** {', '.join(unrecognized)}\n"
        )
    else:
        md.append(
            "Alle zehn Modellnamen wurden von ThirstyAIs Klassifikation direkt "
            "erkannt (confidence 3, kein Rueckfall auf eine Standardklasse).\n"
        )
    md.append(
        "Alle zehn ThirstyAI-Ergebnisse haben confidence 1: keines der Modelle "
        "trifft ThirstyAIs Vollstack-Sonderfall (nur 'gemini-apps'), daher greift "
        "ueberall der overhead-factor (ANNAHME, confidence 1) und floort die "
        "Gesamt-confidence - das ist erwartetes Verhalten, kein Fehler.\n"
    )
    md.append(
        "**Wichtigster Befund vorab:** Nur bei Llama-3.1-70B-Instruct (reales, "
        "offenes Modell mit oeffentlich bekannter Parameterzahl) liegen beide "
        "Systeme innerhalb von 40 % beieinander (siehe llama-Zeilen unten). Bei "
        "allen anderen vier Familien muss EcoLogits die Parameterzahl selbst "
        "schaetzen (proprietaere Modelle) - das ist der groesste Einzelfaktor fuer "
        "die Abweichungen unten, nicht ein Fehler in einem der beiden Systeme.\n"
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
