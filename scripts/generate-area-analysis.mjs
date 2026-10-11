import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "public", "data");
const START_DATE = process.env.AGRI_DATA_START ?? "20250101";
const END_DATE = process.env.AGRI_DATA_END ?? "20251231";

const cropCatalog = [
  {
    crop: "Ragi",
    season: "Kharif",
    waterNeed: "Low",
    temp: [18, 34],
    rain: [450, 950],
    ph: [5.0, 7.5],
    texture: ["sandy loam", "loam", "clay loam"],
    notes: ["Good dryland resilience", "Suitable for Karnataka rainfed belts"],
  },
  {
    crop: "Groundnut",
    season: "Kharif / Summer with irrigation",
    waterNeed: "Medium",
    temp: [22, 32],
    rain: [500, 1000],
    ph: [6.0, 7.5],
    texture: ["sandy loam", "loam"],
    notes: ["Performs well in well-drained light soils", "Sensitive to waterlogging"],
  },
  {
    crop: "Red gram / Pigeon pea",
    season: "Kharif",
    waterNeed: "Low",
    temp: [20, 35],
    rain: [500, 900],
    ph: [5.5, 7.5],
    texture: ["sandy loam", "loam", "clay loam"],
    notes: ["Useful contingency crop", "Tolerates moderate dry spells"],
  },
  {
    crop: "Maize",
    season: "Kharif / Rabi with irrigation",
    waterNeed: "Medium",
    temp: [18, 32],
    rain: [600, 1100],
    ph: [5.8, 7.5],
    texture: ["loam", "clay loam"],
    notes: ["Good where rainfall is reliable", "Needs moisture during tasseling"],
  },
  {
    crop: "Tomato",
    season: "Rabi / Summer with irrigation",
    waterNeed: "High",
    temp: [18, 30],
    rain: [500, 900],
    ph: [6.0, 7.0],
    texture: ["sandy loam", "loam"],
    notes: ["High-value option with irrigation", "Needs flood and heat protection"],
  },
  {
    crop: "Beans",
    season: "Kharif / Rabi",
    waterNeed: "Medium",
    temp: [16, 30],
    rain: [500, 900],
    ph: [6.0, 7.5],
    texture: ["loam", "sandy loam"],
    notes: ["Good peri-urban vegetable option", "Avoid waterlogged plots"],
  },
  {
    crop: "Leafy vegetables",
    season: "Year-round with irrigation",
    waterNeed: "High",
    temp: [15, 30],
    rain: [450, 900],
    ph: [6.0, 7.5],
    texture: ["loam", "sandy loam"],
    notes: ["Fast return crop", "Sensitive to heat and excess rain"],
  },
  {
    crop: "Fodder maize",
    season: "Kharif / irrigated blocks",
    waterNeed: "Medium",
    temp: [18, 34],
    rain: [550, 1100],
    ph: [5.8, 7.8],
    texture: ["loam", "clay loam", "sandy loam"],
    notes: ["Useful for mixed farming", "Can tolerate moderate heat"],
  },
  {
    crop: "Marigold / floriculture",
    season: "Rabi / irrigated",
    waterNeed: "Medium",
    temp: [18, 32],
    rain: [500, 900],
    ph: [6.0, 7.5],
    texture: ["sandy loam", "loam"],
    notes: ["High-value peri-urban crop", "Needs heat and drainage management"],
  },
  {
    crop: "Grapes",
    season: "Perennial horticulture",
    waterNeed: "High",
    temp: [15, 35],
    rain: [500, 900],
    ph: [6.0, 7.5],
    texture: ["sandy loam", "loam"],
    notes: ["Needs assured irrigation and management", "Disease risk rises with excess humidity"],
  },
];

async function main() {
  await mkdir(dataDir, { recursive: true });
  const regions = JSON.parse(await readFile(path.join(dataDir, "risk-scores.json"), "utf8"));

  const analyses = [];
  for (const region of regions) {
    const [lat, lon] = region.centroid;
    console.log(`Preparing ${region.name} (${lat}, ${lon})`);

    const [climateResult, soilResult] = await Promise.allSettled([
      fetchClimate(lat, lon),
      fetchSoil(lat, lon),
    ]);

    const climate =
      climateResult.status === "fulfilled"
        ? climateResult.value
        : estimateClimate(region);
    const soil =
      soilResult.status === "fulfilled"
        ? soilResult.value
        : estimateSoil(region);

    const dataMode = climateResult.status === "fulfilled" && soilResult.status === "fulfilled"
      ? "real-api"
      : climateResult.status === "fulfilled" || soilResult.status === "fulfilled"
        ? "mixed-real-estimated"
        : "estimated-fallback";

    analyses.push({
      areaId: region.id,
      generatedAt: new Date().toISOString(),
      dataMode,
      sources: [
        climateResult.status === "fulfilled"
          ? `NASA POWER daily AG API (${START_DATE}-${END_DATE})`
          : "Estimated climate fallback from local risk features",
        soilResult.status === "fulfilled"
          ? "ISRIC SoilGrids v2.0 point query"
          : "Estimated soil fallback from local agronomic assumptions",
        "Crop suitability rules adapted from FAO ECOCROP-style climate/soil constraints",
      ],
      climate,
      soil,
      cropSuitability: rankCrops(climate, soil, region),
      surroundings: buildSurroundings(region, climate, soil),
      recommendationSummary: buildSummary(region, climate, soil),
    });
  }

  await writeFile(
    path.join(dataDir, "area-analysis.json"),
    `${JSON.stringify(analyses, null, 2)}\n`,
    "utf8",
  );
}

async function fetchClimate(lat, lon) {
  const params = new URLSearchParams({
    parameters: "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M",
    community: "AG",
    longitude: String(lon),
    latitude: String(lat),
    start: START_DATE,
    end: END_DATE,
    format: "JSON",
  });
  const response = await fetch(`https://power.larc.nasa.gov/api/temporal/daily/point?${params}`);
  if (!response.ok) throw new Error(`NASA POWER ${response.status}`);

  const json = await response.json();
  const data = json.properties.parameter;
  const rainfall = Object.values(data.PRECTOTCORR).map(Number).filter(validNumber);
  const temp = Object.values(data.T2M).map(Number).filter(validNumber);
  const tempMax = Object.values(data.T2M_MAX).map(Number).filter(validNumber);
  const tempMin = Object.values(data.T2M_MIN).map(Number).filter(validNumber);
  const humidity = Object.values(data.RH2M).map(Number).filter(validNumber);
  const wind = Object.values(data.WS2M).map(Number).filter(validNumber);
  const dates = Object.keys(data.PRECTOTCORR);
  const monsoonRain = dates.reduce((sum, date) => {
    const month = Number(date.slice(4, 6));
    const value = Number(data.PRECTOTCORR[date]);
    return month >= 6 && month <= 9 && validNumber(value) ? sum + value : sum;
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

async function fetchSoil(lat, lon) {
  const params = new URLSearchParams({
    lon: String(lon),
    lat: String(lat),
    depth: "0-5cm",
    value: "mean",
  });
  for (const property of ["phh2o", "soc", "nitrogen", "clay", "sand", "silt", "cec"]) {
    params.append("property", property);
  }

  const response = await fetch(`https://rest.isric.org/soilgrids/v2.0/properties/query?${params}`);
  if (!response.ok) throw new Error(`SoilGrids ${response.status}`);

  const json = await response.json();
  const layers = json.properties.layers;
  const raw = Object.fromEntries(layers.map((layer) => [layer.name, layer.depths[0].values.mean]));
  const soil = {
    ph: round(raw.phh2o / 10, 1),
    organicCarbonGkg: round(raw.soc / 10, 1),
    nitrogenGkg: round(raw.nitrogen / 100, 2),
    cecCmolKg: round(raw.cec / 10, 1),
    clayPct: round(raw.clay / 10, 1),
    sandPct: round(raw.sand / 10, 1),
    siltPct: round(raw.silt / 10, 1),
  };
  return {
    ...soil,
    texture: classifyTexture(soil.sandPct, soil.clayPct),
    fertility: classifyFertility(soil.organicCarbonGkg, soil.nitrogenGkg, soil.cecCmolKg),
    drainage: classifyDrainage(soil.sandPct, soil.clayPct),
  };
}

function rankCrops(climate, soil, region) {
  return cropCatalog
    .map((crop) => {
      const climateFit = bandScore(climate.avgTempC, crop.temp[0], crop.temp[1]) * 0.28
        + bandScore(climate.annualRainfallMm, crop.rain[0], crop.rain[1]) * 0.22;
      const soilFit = bandScore(soil.ph, crop.ph[0], crop.ph[1]) * 0.18
        + (crop.texture.includes(soil.texture) ? 100 : 68) * 0.12
        + fertilityScore(soil.fertility) * 0.08;
      const riskPenalty = cropRiskPenalty(crop, region, climate, soil);
      const localBonus = localCropBonus(crop.crop, region.dominantCrops);
      const score = clamp(climateFit + soilFit + localBonus - riskPenalty, 0, 100);
      const reasons = [
        ...crop.notes,
        `Climate match: ${Math.round(climateFit)} / 50`,
        `Soil match: ${Math.round(soilFit)} / 38`,
      ];
      const warnings = buildCropWarnings(crop, climate, soil, region);

      return {
        crop: crop.crop,
        score: Math.round(score),
        fit: score >= 75 ? "Very High" : score >= 55 ? "High" : score >= 35 ? "Moderate" : "Low",
        season: crop.season,
        waterNeed: crop.waterNeed,
        expectedEfficiency: score >= 75 ? "High input efficiency expected" : score >= 55 ? "Good with management" : score >= 35 ? "Suitable only with safeguards" : "Not preferred for this area",
        reasons,
        warnings,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function cropRiskPenalty(crop, region, climate, soil) {
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

function localCropBonus(crop, dominantCrops) {
  const cropName = crop.toLowerCase();
  const aliases = {
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
  }[cropName] ?? [cropName];
  return dominantCrops.some((cropValue) => aliases.some((alias) => cropValue.toLowerCase().includes(alias))) ? 8 : 0;
}

function buildCropWarnings(crop, climate, soil, region) {
  const warnings = [];
  if (climate.maxTempC >= 36 && crop.temp[1] <= 32) warnings.push("Heat stress protection needed during peak summer.");
  if (region.hazards.flood >= 65) warnings.push("Use raised beds or avoid low-lying plots during monsoon.");
  if (crop.waterNeed === "High" && region.hazards.drought >= 60) warnings.push("Needs assured irrigation; not ideal for rainfed plots.");
  if (soil.ph < crop.ph[0] || soil.ph > crop.ph[1]) warnings.push(`Soil pH ${soil.ph} is outside the preferred range.`);
  if (!warnings.length) warnings.push("No major constraint detected from available climate and soil indicators.");
  return warnings;
}

function buildSurroundings(region, climate, soil) {
  const notes = [
    `A 5 km planning buffer is represented by the polygon centroid and surrounding taluk context.`,
    `Annual rainfall signal is ${climate.annualRainfallMm} mm with ${climate.heatStressDays} heat-stress days.`,
    `Surface soil is classified as ${soil.texture} with ${soil.fertility.toLowerCase()} fertility.`,
  ];
  if (region.hazards.flood >= 65) notes.push("Surrounding low-lying and drainage-adjacent parcels should be inspected before monsoon sowing.");
  if (region.hazards.drought >= 65) notes.push("Nearby rainfed parcels need contingency crops and soil-moisture conservation.");
  return { bufferKm: 5, notes };
}

function buildSummary(region, climate, soil) {
  const top = rankCrops(climate, soil, region)[0];
  return `${top.crop} is currently the best-ranked crop for ${region.name} (${top.score}/100) because the local rainfall, temperature and soil profile fit its requirements better than the alternatives.`;
}

function estimateClimate(region) {
  const latFactor = (region.centroid[0] - 12.6) * 40;
  const dry = region.hazards.drought;
  const heat = region.hazards.heat;
  const flood = region.hazards.flood;
  return {
    annualRainfallMm: round(900 + flood * 2 - dry * 2 + latFactor, 1),
    monsoonRainfallMm: round(610 + flood * 1.5 - dry, 1),
    avgTempC: round(23.5 + heat * 0.035, 1),
    maxTempC: round(31 + heat * 0.09, 1),
    minTempC: round(16 + heat * 0.025, 1),
    heatStressDays: Math.round(Math.max(5, heat * 0.55)),
    drySpellDays: Math.round(110 + dry * 0.8),
    avgHumidityPct: round(58 + flood * 0.18 - dry * 0.08, 1),
    avgWindMs: 2.2,
  };
}

function estimateSoil(region) {
  const dry = region.hazards.drought;
  const flood = region.hazards.flood;
  const sand = clamp(42 + dry * 0.25 - flood * 0.08, 30, 65);
  const clay = clamp(25 + flood * 0.18 - dry * 0.1, 18, 42);
  const silt = clamp(100 - sand - clay, 12, 38);
  const organicCarbonGkg = round(clamp(8 - dry * 0.035 + flood * 0.018, 4.2, 10.5), 1);
  const nitrogenGkg = round(clamp(0.65 - dry * 0.003 + flood * 0.001, 0.35, 0.85), 2);
  const cecCmolKg = round(clamp(12 + clay * 0.18, 9, 20), 1);
  const ph = round(clamp(6.4 + (dry - 55) * 0.004, 5.9, 7.3), 1);
  return {
    ph,
    organicCarbonGkg,
    nitrogenGkg,
    cecCmolKg,
    clayPct: round(clay, 1),
    sandPct: round(sand, 1),
    siltPct: round(silt, 1),
    texture: classifyTexture(sand, clay),
    fertility: classifyFertility(organicCarbonGkg, nitrogenGkg, cecCmolKg),
    drainage: classifyDrainage(sand, clay),
  };
}

function classifyTexture(sand, clay) {
  if (sand >= 55 && clay < 25) return "sandy loam";
  if (clay >= 35) return "clay loam";
  return "loam";
}

function classifyFertility(organicCarbon, nitrogen, cec) {
  const score = organicCarbon * 4 + nitrogen * 35 + cec * 1.5;
  if (score >= 58) return "High";
  if (score >= 42) return "Medium";
  return "Low";
}

function classifyDrainage(sand, clay) {
  if (clay >= 38) return "Poor";
  if (sand >= 48) return "Good";
  return "Moderate";
}

function bandScore(value, minValue, maxValue) {
  if (value >= minValue && value <= maxValue) return 100;
  const distance = value < minValue ? minValue - value : value - maxValue;
  return clamp(100 - distance * 8, 0, 100);
}

function fertilityScore(fertility) {
  return { High: 100, Medium: 74, Low: 48 }[fertility];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return values.length ? sum(values) / values.length : 0;
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function min(values) {
  return values.length ? Math.min(...values) : 0;
}

function validNumber(value) {
  return Number.isFinite(value) && value > -900;
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
