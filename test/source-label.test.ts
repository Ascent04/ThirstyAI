import { describe, expect, it } from "vitest";
import { sourceLabel } from "../web/source-label.js";

describe("sourceLabel", () => {
  it("Autorenliste mit Doppelpunkt wird zu Erstautor et al. (Jahr)", () => {
    expect(
      sourceLabel({
        title:
          "Oviedo, Kazhamiaka, Choukse, Kim, Luers, Nakagawa, Bianchini, Lavista Ferres: Energy use of AI inference, efficiency pathways, and test-time scaling (Preprint)",
        year: 2025,
      }),
    ).toBe("Oviedo et al. (2025)");
  });

  it("Kopf ohne Komma bleibt stehen", () => {
    expect(
      sourceLabel({ title: "Lohrmann et al.: Assessment of the water footprint for the European power sector (Energy 233)", year: 2021 }),
    ).toBe("Lohrmann et al. (2021)");
    expect(sourceLabel({ title: "Umweltbundesamt: CLIMATE CHANGE 16/2026", year: 2026 })).toBe("Umweltbundesamt (2026)");
  });

  it("authors-Feld hat Vorrang vor dem Titel", () => {
    expect(
      sourceLabel({
        title: "Energy use of AI inference, efficiency pathways, and test-time scaling",
        year: 2025,
        authors: "Oviedo, Kazhamiaka (Microsoft Research)",
      }),
    ).toBe("Oviedo et al. (2025)");
  });

  it("ohne Autorenkopf bleibt der volle Titel", () => {
    expect(sourceLabel({ title: "Meta Llama 3.1 Model Card", year: 2024 })).toBe("Meta Llama 3.1 Model Card");
    expect(sourceLabel({ title: "Caravaca et al. 2025 (arXiv:2511.05597)", year: 2025 })).toBe(
      "Caravaca et al. 2025 (arXiv:2511.05597)",
    );
  });

  it("ohne Jahr kein Klammerzusatz", () => {
    expect(sourceLabel({ title: "Li, Yang, Islam, Ren: Making AI Less 'Thirsty' (v5)" })).toBe("Li et al.");
  });
});
