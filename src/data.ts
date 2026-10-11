import type { AreaAnalysis, GeoJsonFeatureCollection, RiskRegion } from "./types";

export interface ClimateRiskData {
  regions: RiskRegion[];
  geojson: GeoJsonFeatureCollection;
  areaAnalysis: Record<string, AreaAnalysis>;
}

export async function loadClimateRiskData(): Promise<ClimateRiskData> {
  const [regionsResponse, geojsonResponse, areaAnalysisResponse] = await Promise.all([
    fetch("./data/risk-scores.json"),
    fetch("./data/bengaluru-regions.geojson"),
    fetch("./data/area-analysis.json"),
  ]);

  if (!regionsResponse.ok || !geojsonResponse.ok || !areaAnalysisResponse.ok) {
    throw new Error("Unable to load climate-risk data from /public/data.");
  }

  const areaAnalysis = (await areaAnalysisResponse.json()) as AreaAnalysis[];

  return {
    regions: (await regionsResponse.json()) as RiskRegion[],
    geojson: (await geojsonResponse.json()) as GeoJsonFeatureCollection,
    areaAnalysis: Object.fromEntries(areaAnalysis.map((analysis) => [analysis.areaId, analysis])),
  };
}
