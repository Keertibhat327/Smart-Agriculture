import type { AreaAnalysis, ClimateProfile, CropRecommendation, RiskClass, RiskRegion, SoilProfile } from "./types";

const START_DATE = "20250101";
const END_DATE = "20251231";

interface CropRule {
  crop: string;
  season: string;
  waterNeed: "Low" | "Medium" | "High";
  temp: [number, number];
  rain: [number, number];
  ph: [number, number];
  texture: string[];
  notes: string[];
}

const cropCatalog: CropRule[] = [
  { crop: "Ragi", season: "Kharif", waterNeed: "Low", temp: [18, 34], rain: [450, 950], ph: [5.0, 7.5], texture: ["sandy loam", "loam", "clay loam"], notes: ["Good dryland resilience", "Suitable for Karnataka rainfed belts"] },
  { crop: "Groundnut", season: "Kharif / Summer with irrigation", waterNeed: "Medium", temp: [22, 32], rain: [500, 1000], ph: [6.0, 7.5], texture: ["sandy loam", "loam"], notes: ["Performs well in well-drained light soils", "Sensitive to waterlogging"] },
  { crop: "Red gram / Pigeon pea", season: "Kharif", waterNeed: "Low", temp: [20, 35], rain: [500, 900], ph: [5.5, 7.5], texture: ["sandy loam", "loam", "clay loam"], notes: ["Useful contingency crop", "Tolerates moderate dry spells"] },
  { crop: "Maize", season: "Kharif / Rabi with irrigation", waterNeed: "Medium", temp: [18, 32], rain: [600, 1100], ph: [5.8, 7.5], texture: ["loam", "clay loam"], notes: ["Good where rainfall is reliable", "Needs moisture during tasseling"] },
  { crop: "Tomato", season: "Rabi / Summer with irrigation", waterNeed: "High", temp: [18, 30], rain: [500, 900], ph: [6.0, 7.0], texture: ["sandy loam", "loam"], notes: ["High-value option with irrigation", "Needs flood and heat protection"] },
  { crop: "Beans", season: "Kharif / Rabi", waterNeed: "Medium", temp: [16, 30], rain: [500, 900], ph: [6.0, 7.5], texture: ["loam", "sandy loam"], notes: ["Good peri-urban vegetable option", "Avoid waterlogged plots"] },
  { crop: "Leafy vegetables", season: "Year-round with irrigation", waterNeed: "High", temp: [15, 30], rain: [450, 900], ph: [6.0, 7.5], texture: ["loam", "sandy loam"], notes: ["Fast return crop", "Sensitive to heat and excess rain"] },
  { crop: "Fodder maize", season: "Kharif / irrigated blocks", waterNeed: "Medium", temp: [18, 34], rain: [550, 1100], ph: [5.8, 7.8], texture: ["loam", "clay loam", "sandy loam"], notes: ["Useful for mixed farming", "Can tolerate moderate heat"] },
  { crop: "Marigold / floriculture", season: "Rabi / irrigated", waterNeed: "Medium", temp: [18, 32], rain: [500, 900], ph: [6.0, 7.5], texture: ["sandy loam", "loam"], notes: ["High-value peri-urban crop", "Needs heat and drainage management"] },
  { crop: "Grapes", season: "Perennial horticulture", waterNeed: "High", temp: [15, 35], rain: [500, 900], ph: [6.0, 7.5], texture: ["sandy loam", "loam"], notes: ["Needs assured irrigation and management", "Disease risk rises with excess humidity"] },
];

export async function analyzePoint(lat: number, lon: number, label = "Clicked map location"): Promise<{
  region: RiskRegion;
  analysis: AreaAnalysis;
}> {
  const [climate, soil] = await Promise.all([fetchClimate(lat, lon), fetchSoil(lat, lon)]);
  const hazards = hazardsFromProfiles(climate, soil);
  const region: RiskRegion = {
    id: `custom-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    name: label,
    taluk: "Custom location",
    centroid: [lat, lon],
    dominantCrops: [],
    hazards,
    exposure: 60,
    vulnerability: vulnerabilityFromProfiles(climate, soil),
    shapFactors: [
      { feature: "Rainfall intensity", contribution: Math.round(hazards.flood * 0.28), direction: "increases" },
      { feature: "Heat stress days", contribution: Math.round(hazards.heat * 0.25), direction: "increases" },
      { feature: "Soil drainage", contribution: soil.drainage === "Good" ? 8 : 16, direction: soil.drainage === "Good" ? "reduces" : "increases" },
      { feature: "Dry spell pressure", contribution: Math.round(hazards.drought * 0.22), direction: "increases" },
    ],
    advice: "Generated from live public climate and soil APIs for the clicked point.",
    decisionSupport: buildDecisionSupport(hazards),
    notes: "Live point analysis from public APIs. Boundary-level exposure should be replaced with official district/ward data for production.",
  };

  const cropSuitability = rankCrops(climate, soil, region);
  const analysis: AreaAnalysis = {
    areaId: region.id,
    generatedAt: new Date().toISOString(),
    dataMode: "real-api",
    sources: [
      `NASA POWER daily AG API (${START_DATE}-${END_DATE})`,
      "ISRIC SoilGrids v2.0 point query",
      "Client-side crop suitability rules adapted from FAO ECOCROP-style constraints",
    ],
    climate,
    soil,
    cropSuitability,
    surroundings: {
      bufferKm: 5,
      notes: [
        `Point analysis centered at ${lat.toFixed(4)}, ${lon.toFixed(4)}.`,
        `Annual rainfall signal is ${climate.annualRainfallMm} mm with ${climate.heatStressDays} heat-stress days.`,
        `Surface soil is ${soil.texture} with ${soil.fertility.toLowerCase()} fertility and ${soil.drainage.toLowerCase()} drainage.`,
      ],
    },
    recommendationSummary: `${cropSuitability[0].crop} is the best-ranked crop for this clicked point (${cropSuitability[0].score}/100) based on climate, soil and water-stress fit.`,
  };

  return { region, analysis };
}

async function fetchClimate(lat: number, lon: number): Promise<ClimateProfile> {
  const params = new URLSearchParams({
    parameters: "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M",
    community: "AG",
    longitude: String(lon),
    latitude: String(lat),
    start: START_DATE,
    end: END_DATE,
    format: "JSON",
  });
  const response = await fetch(`https://power.larc.nasa.gov/api/temporal/daily/point?${params}`, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`NASA POWER request failed (${response.status}).`);

  const json = await response.json();
  const data = json.properties.parameter;
  for (const key of ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "WS2M"]) {
    if (!data[key] || !Object.values(data[key]).some(value => value !== null && validNumber(Number(value)))) {
      throw new Error("Climate observations are unavailable for this location.");
    }
  }
  const rainfall = Object.values(data.PRECTOTCORR).map(Number).filter(validNumber);
  const temp = Object.values(data.T2M).map(Number).filter(validNumber);
  const tempMax = Object.values(data.T2M_MAX).map(Number).filter(validNumber);
  const tempMin = Object.values(data.T2M_MIN).map(Number).filter(validNumber);
  const humidity = Object.values(data.RH2M).map(Number).filter(validNumber);
  const wind = Object.values(data.WS2M).map(Number).filter(validNumber);
  const dates = Object.keys(data.PRECTOTCORR);
  const monsoonRain = dates.reduce((sumValue, date) => {
    const month = Number(date.slice(4, 6));
    const value = Number(data.PRECTOTCORR[date]);
    return month >= 6 && month <= 9 && validNumber(value) ? sumValue + value : sumValue;
  }, 0);

  return {
    annualRainfallMm: round(sum(rainfall), 1),
    monsoonRainfallMm: round(monsoonRain, 1),
    avgTempC: round(mean(temp), 1),
    maxTempC: round(max(tempMax), 1),
    minTempC: round(min(tempMin), 1),
    heatStressDays: tempMax.filter((value) => value >= 35).length,
    drySpellDays: rainfall.filter((value) => value < 1).length,
    avgHumidityPct: round(mean(humidity), 1),
    avgWindMs: round(mean(wind), 1),
  };
}

async function fetchSoil(lat: number, lon: number): Promise<SoilProfile> {
  const params = new URLSearchParams({ lon: String(lon), lat: String(lat), depth: "0-5cm", value: "mean" });
  for (const property of ["phh2o", "soc", "nitrogen", "clay", "sand", "silt", "cec"]) {
    params.append("property", property);
  }
  const response = await fetch(`https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`SoilGrids request failed (${response.status}).`);

  const json = await response.json();
  const layers = json.properties.layers;
  const raw = Object.fromEntries(layers.map((layer: { name: string; depths: Array<{ values: { mean: number } }> }) => [layer.name, layer.depths[0].values.mean]));
  // Missing soil cells must not become zeros and produce misleading crop rankings.
  if (["phh2o", "soc", "nitrogen", "clay", "sand", "silt", "cec"].some(key => raw[key] == null || !validNumber(Number(raw[key])))) {
    throw new Error("Soil observations are unavailable for this location. Select a nearby agricultural area.");
  }
  const soil = {
    ph: round(Number(raw.phh2o) / 10, 1),
    organicCarbonGkg: round(Number(raw.soc) / 10, 1),
    nitrogenGkg: round(Number(raw.nitrogen) / 100, 2),
    cecCmolKg: round(Number(raw.cec) / 10, 1),
    clayPct: round(Number(raw.clay) / 10, 1),
    sandPct: round(Number(raw.sand) / 10, 1),
    siltPct: round(Number(raw.silt) / 10, 1),
  };

  return {
    ...soil,
    texture: classifyTexture(soil.sandPct, soil.clayPct),
    fertility: classifyFertility(soil.organicCarbonGkg, soil.nitrogenGkg, soil.cecCmolKg),
    drainage: classifyDrainage(soil.sandPct, soil.clayPct),
  };
}

function rankCrops(climate: ClimateProfile, soil: SoilProfile, region: RiskRegion): CropRecommendation[] {
  return cropCatalog
    .map((crop) => {
      const climateFit = bandScore(climate.avgTempC, crop.temp[0], crop.temp[1]) * 0.28
        + bandScore(climate.annualRainfallMm, crop.rain[0], crop.rain[1]) * 0.22;
      const soilFit = bandScore(soil.ph, crop.ph[0], crop.ph[1]) * 0.18
        + (crop.texture.includes(soil.texture) ? 100 : 68) * 0.12
        + fertilityScore(soil.fertility) * 0.08;
      const riskPenalty = cropRiskPenalty(crop, region, climate, soil);
      const score = clamp(climateFit + soilFit + localCropBonus(crop.crop, region.dominantCrops) - riskPenalty, 0, 100);

      const fit: RiskClass = score >= 75 ? "Very High" : score >= 55 ? "High" : score >= 35 ? "Moderate" : "Low";
      return {
        crop: crop.crop,
        score: Math.round(score),
        fit,
        season: crop.season,
        waterNeed: crop.waterNeed,
        expectedEfficiency: score >= 75 ? "High input efficiency expected" : score >= 55 ? "Good with management" : score >= 35 ? "Suitable only with safeguards" : "Not preferred for this area",
        reasons: [...crop.notes, `Climate match: ${Math.round(climateFit)} / 50`, `Soil match: ${Math.round(soilFit)} / 38`],
        warnings: buildCropWarnings(crop, climate, soil, region),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function hazardsFromProfiles(climate: ClimateProfile, soil: SoilProfile) {
  return {
    flood: clamp((climate.monsoonRainfallMm - 350) * 0.12 + (soil.drainage === "Poor" ? 35 : soil.drainage === "Moderate" ? 20 : 8), 10, 95),
    heat: clamp(climate.heatStressDays * 1.1 + Math.max(0, climate.maxTempC - 34) * 4, 10, 95),
    drought: clamp((climate.drySpellDays - 130) * 0.42 + Math.max(0, 850 - climate.annualRainfallMm) * 0.05, 10, 95),
  };
}

function vulnerabilityFromProfiles(climate: ClimateProfile, soil: SoilProfile) {
  const fertilityPenalty = soil.fertility === "Low" ? 18 : soil.fertility === "Medium" ? 9 : 0;
  return clamp(42 + fertilityPenalty + climate.heatStressDays * 0.18 + climate.drySpellDays * 0.05, 25, 90);
}

function buildDecisionSupport(hazards: { flood: number; heat: number; drought: number }) {
  return {
    cropPlanning: ["Use the crop ranking as a first screen, then confirm local seed availability and market demand.", "Prefer resilient crops when heat or drought scores are high."],
    irrigationPlanning: hazards.drought > 60 ? ["Prioritize drip irrigation or protective irrigation.", "Avoid high-water crops unless assured irrigation is available."] : ["Use soil-moisture-based irrigation scheduling.", "Avoid irrigation before expected rainfall."],
    sowingWindow: ["Align sowing with reliable rainfall onset.", "Avoid sowing just before high-intensity rainfall alerts."],
    floodPreparedness: hazards.flood > 60 ? ["Use raised beds in low-lying plots.", "Clear drainage paths before monsoon rainfall."] : ["Maintain basic drainage and field bunds.", "Monitor intense rainfall events."],
    heatStress: hazards.heat > 60 ? ["Use mulching and shade protection for nurseries.", "Avoid pesticide sprays during peak afternoon heat."] : ["Monitor heat stress during flowering and transplanting.", "Use morning/evening irrigation where needed."],
    riskMonitoring: ["Refresh data before each season.", "Use this result as screening support, not certified agronomic advice."],
  };
}

function cropRiskPenalty(crop: CropRule, region: RiskRegion, climate: ClimateProfile, soil: SoilProfile) {
  let penalty = 0;
  if (climate.heatStressDays > 45 && crop.temp[1] <= 34) penalty += 5;
  if (climate.drySpellDays > 220 && crop.waterNeed === "Medium") penalty += 5;
  if (crop.waterNeed === "High" && region.hazards.drought > 60) penalty += 14;
  if (crop.waterNeed === "High" && climate.drySpellDays > 160) penalty += 8;
  if (region.hazards.flood > 65 && ["Tomato", "Leafy vegetables", "Groundnut", "Beans"].includes(crop.crop)) penalty += 12;
  if (region.hazards.heat > 65 && crop.temp[1] <= 32) penalty += 10;
  if (soil.drainage === "Poor" && ["Tomato", "Groundnut", "Leafy vegetables"].includes(crop.crop)) penalty += 12;
  return penalty;
}

function localCropBonus(crop: string, dominantCrops: string[]) {
  const cropName = crop.toLowerCase();
  const aliases: Record<string, string[]> = {
    "red gram / pigeon pea": ["pulses"],
    maize: ["maize"],
    "fodder maize": ["fodder", "maize"],
    "marigold / floriculture": ["flowers", "floriculture"],
    tomato: ["tomato", "vegetables"],
    beans: ["beans", "vegetables"],
    "leafy vegetables": ["leafy vegetables", "vegetables"],
    grapes: ["grapes"],
    groundnut: ["groundnut", "oilseeds"],
    ragi: ["ragi", "millets"],
  };
  return dominantCrops.some((cropValue) => (aliases[cropName] ?? [cropName]).some((alias) => cropValue.toLowerCase().includes(alias))) ? 8 : 0;
}

function buildCropWarnings(crop: CropRule, climate: ClimateProfile, soil: SoilProfile, region: RiskRegion) {
  const warnings = [];
  if (climate.maxTempC >= 36 && crop.temp[1] <= 32) warnings.push("Heat stress protection needed during peak summer.");
  if (region.hazards.flood >= 65) warnings.push("Use raised beds or avoid low-lying plots during monsoon.");
  if (crop.waterNeed === "High" && region.hazards.drought >= 60) warnings.push("Needs assured irrigation; not ideal for rainfed plots.");
  if (soil.ph < crop.ph[0] || soil.ph > crop.ph[1]) warnings.push(`Soil pH ${soil.ph} is outside the preferred range.`);
  if (!warnings.length) warnings.push("No major constraint detected from available climate and soil indicators.");
  return warnings;
}

function classifyTexture(sand: number, clay: number) {
  if (sand >= 55 && clay < 25) return "sandy loam";
  if (clay >= 35) return "clay loam";
  return "loam";
}

function classifyFertility(organicCarbon: number, nitrogen: number, cec: number) {
  const score = organicCarbon * 4 + nitrogen * 35 + cec * 1.5;
  if (score >= 58) return "High";
  if (score >= 42) return "Medium";
  return "Low";
}

function classifyDrainage(sand: number, clay: number) {
  if (clay >= 38) return "Poor";
  if (sand >= 48) return "Good";
  return "Moderate";
}

function bandScore(value: number, minValue: number, maxValue: number) {
  if (value >= minValue && value <= maxValue) return 100;
  const distance = value < minValue ? minValue - value : value - maxValue;
  return clamp(100 - distance * 8, 0, 100);
}

function fertilityScore(fertility: SoilProfile["fertility"]) {
  return { High: 100, Medium: 74, Low: 48 }[fertility];
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]) {
  return values.length ? sum(values) / values.length : 0;
}

function max(values: number[]) {
  return values.length ? Math.max(...values) : 0;
}

function min(values: number[]) {
  return values.length ? Math.min(...values) : 0;
}

function validNumber(value: number) {
  return Number.isFinite(value) && value > -900;
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(maxValue, value));
}
