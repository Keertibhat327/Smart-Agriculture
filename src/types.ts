export type HazardKey = "flood" | "heat" | "drought";

export type RiskClass = "Low" | "Moderate" | "High" | "Very High";

export interface HazardScores {
  flood: number;
  heat: number;
  drought: number;
}

export interface ShapFactor {
  feature: string;
  contribution: number;
  direction: "increases" | "reduces";
}

export interface DecisionSupport {
  cropPlanning: string[];
  irrigationPlanning: string[];
  sowingWindow: string[];
  floodPreparedness: string[];
  heatStress: string[];
  riskMonitoring: string[];
}

export interface RiskRegion {
  id: string;
  name: string;
  taluk: string;
  centroid: [number, number];
  dominantCrops: string[];
  hazards: HazardScores;
  exposure: number;
  vulnerability: number;
  shapFactors: ShapFactor[];
  advice: string;
  decisionSupport: DecisionSupport;
  notes: string;
}

export interface ClimateProfile {
  annualRainfallMm: number;
  monsoonRainfallMm: number;
  avgTempC: number;
  maxTempC: number;
  minTempC: number;
  heatStressDays: number;
  drySpellDays: number;
  avgHumidityPct: number;
  avgWindMs: number;
}

export interface SoilProfile {
  ph: number;
  organicCarbonGkg: number;
  nitrogenGkg: number;
  cecCmolKg: number;
  clayPct: number;
  sandPct: number;
  siltPct: number;
  texture: string;
  fertility: "Low" | "Medium" | "High";
  drainage: "Poor" | "Moderate" | "Good";
}

export interface CropRecommendation {
  crop: string;
  score: number;
  fit: RiskClass;
  season: string;
  waterNeed: "Low" | "Medium" | "High";
  expectedEfficiency: string;
  reasons: string[];
  warnings: string[];
}

export interface AreaAnalysis {
  areaId: string;
  generatedAt: string;
  dataMode: "real-api" | "mixed-real-estimated" | "estimated-fallback";
  sources: string[];
  climate: ClimateProfile;
  soil: SoilProfile;
  cropSuitability: CropRecommendation[];
  surroundings: {
    bufferKm: number;
    notes: string[];
  };
  recommendationSummary: string;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      id: string;
      name: string;
      taluk: string;
    };
    geometry: {
      type: "Polygon";
      coordinates: number[][][];
    };
  }>;
}

export interface RiskComputation {
  score: number;
  riskClass: RiskClass;
  hazardComposite: number;
  adjustedHazards: HazardScores;
}

export interface ScenarioState {
  rainfallDeltaPct: number;
  temperatureDeltaC: number;
}

export type HazardWeights = Record<HazardKey, number>;
export type HazardToggles = Record<HazardKey, boolean>;
