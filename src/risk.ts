import type {
  HazardKey,
  HazardScores,
  HazardToggles,
  HazardWeights,
  RiskClass,
  RiskComputation,
  RiskRegion,
  ScenarioState,
} from "./types";

const hazardKeys: HazardKey[] = ["flood", "heat", "drought"];

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export function classifyRisk(score: number): RiskClass {
  if (score >= 75) return "Very High";
  if (score >= 50) return "High";
  if (score >= 25) return "Moderate";
  return "Low";
}

export function applyScenario(hazards: HazardScores, scenario: ScenarioState): HazardScores {
  const rainfall = scenario.rainfallDeltaPct;
  const temp = scenario.temperatureDeltaC;

  return {
    flood: clamp(hazards.flood + rainfall * 0.28),
    heat: clamp(hazards.heat + temp * 5.5),
    drought: clamp(hazards.drought + temp * 4.5 - rainfall * 0.18),
  };
}

export function computeRisk(
  region: RiskRegion,
  weights: HazardWeights,
  toggles: HazardToggles,
  scenario: ScenarioState,
): RiskComputation {
  const adjustedHazards = applyScenario(region.hazards, scenario);
  const active = hazardKeys.filter((key) => toggles[key] && weights[key] > 0);
  const weightTotal = active.reduce((sum, key) => sum + weights[key], 0);
  const hazardComposite =
    weightTotal === 0
      ? 0
      : active.reduce((sum, key) => sum + adjustedHazards[key] * weights[key], 0) / weightTotal;

  const score = clamp((hazardComposite * region.exposure * region.vulnerability) / 10000);

  return {
    score: Number(score.toFixed(1)),
    riskClass: classifyRisk(score),
    hazardComposite: Number(hazardComposite.toFixed(1)),
    adjustedHazards,
  };
}

export function riskColor(riskClass: RiskClass): string {
  return {
    Low: "#2f9e44",
    Moderate: "#e6a700",
    High: "#e8590c",
    "Very High": "#c92a2a",
  }[riskClass];
}

export function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
