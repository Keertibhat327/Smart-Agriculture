import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  Gauge,
  Leaf,
  Loader2,
  MapPinned,
  SlidersHorizontal,
  Moon, Sun, Sprout, LayoutDashboard, BarChart3, Globe, Search, RotateCcw,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadClimateRiskData } from "./data";
import { analyzePoint } from "./cropModel";
import { computeRisk, downloadBlob, riskColor } from "./risk";
import type {
  ClimateRiskData,
} from "./data";
import type { AreaAnalysis, HazardKey, HazardToggles, HazardWeights, RiskRegion, ScenarioState } from "./types";
import DetailsPanel from "./components/DetailsPanel";
import DecisionTabs from "./components/DecisionTabs";
import SdgPanel from "./components/SdgPanel";
import CropFocus from "./components/CropFocus";
import { resolvePlaceName, type PlaceName } from "./placeNames";

const RiskMap = lazy(() => import("./components/RiskMap"));

const initialWeights: HazardWeights = {
  flood: 0.34,
  heat: 0.33,
  drought: 0.33,
};

const initialToggles: HazardToggles = {
  flood: true,
  heat: true,
  drought: true,
};

const hazardLabels: Record<HazardKey, string> = {
  flood: "Flood",
  heat: "Heat stress",
  drought: "Drought / water stress",
};

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("agri-theme") === "light" ? "light" : "dark");
  const [search, setSearch] = useState("");
  const [focusedCrop, setFocusedCrop] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(true);
  const [pointLocation, setPointLocation] = useState<[number, number] | null>(null);
  const requestId = useRef(0);
  const placeRequest = useRef<AbortController | null>(null);
  const [pointPlace, setPointPlace] = useState<PlaceName | null>(null);
  const [scenarioEnabled, setScenarioEnabled] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("agri-theme", theme); }, [theme]);
  const [data, setData] = useState<ClimateRiskData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState("hos-03");
  const [weights, setWeights] = useState(initialWeights);
  const [toggles, setToggles] = useState(initialToggles);
  const [customRegion, setCustomRegion] = useState<RiskRegion | null>(null);
  const [customAnalysis, setCustomAnalysis] = useState<AreaAnalysis | null>(null);
  const [pointLoading, setPointLoading] = useState(false);
  const [pointError, setPointError] = useState("");
  const [scenario, setScenario] = useState<ScenarioState>({
    rainfallDeltaPct: 0,
    temperatureDeltaC: 0,
  });

  useEffect(() => {
    loadClimateRiskData()
      .then((loaded) => {
        setData(loaded);
        setSelectedId(loaded.regions[0]?.id ?? "hos-03");
      })
      .catch((error: Error) => setLoadError(error.message));
  }, []);

  const computations = useMemo(() => {
    if (!data) return {};
    const allRegions = customRegion ? [...data.regions, customRegion] : data.regions;
    return Object.fromEntries(allRegions.map((region) => [region.id, computeRisk(region,
      scenarioEnabled ? weights : initialWeights, scenarioEnabled ? toggles : initialToggles,
      scenarioEnabled ? scenario : { rainfallDeltaPct: 0, temperatureDeltaC: 0 })]));
  }, [customRegion, data, weights, toggles, scenario, scenarioEnabled]);

  const selectedRegion = useMemo(() => {
    if (customRegion && selectedId === customRegion.id) return customRegion;
    return data?.regions.find((region) => region.id === selectedId) ?? data?.regions[0] ?? null;
  }, [customRegion, data, selectedId]);

  const selectedComputation = selectedRegion ? computations[selectedRegion.id] : null;

  const updateWeight = (key: HazardKey, value: number) => {
    setWeights((current) => ({ ...current, [key]: value }));
  };

  const handlePolygonSelect = (id: string) => {
    requestId.current += 1;
    placeRequest.current?.abort();
    setPointPlace(null);
    setPointLoading(false);
    setPointLocation(null);
    setFocusedCrop(null);
    setCropOpen(true);
    setPointError("");
    setSelectedId(id);
  };

  const handlePointAnalyze = useCallback(async (lat: number, lng: number) => {
    const currentRequest = ++requestId.current;
    placeRequest.current?.abort();
    const controller = new AbortController();
    placeRequest.current = controller;
    setPointPlace(null);
    setPointLocation([lat, lng]);
    setCropOpen(false);
    setPointLoading(true);
    setPointError("");
    const placePromise = resolvePlaceName(lat, lng, controller.signal).then(place => {
      if (currentRequest === requestId.current) setPointPlace(place);
      return place;
    });
    try {
      const label = `Clicked location (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
      const [result, place] = await Promise.all([analyzePoint(lat, lng, label), placePromise]);
      if (currentRequest !== requestId.current) return;
      result.region.name = place.name;
      result.region.taluk = place.region;
      result.analysis.recommendationSummary = result.analysis.recommendationSummary.replace("this clicked point", place.name);
      if (place.resolved) result.analysis.sources.push("Place name: Photon / OpenStreetMap (nearest mapped locality)");
      setCustomRegion(result.region);
      setCustomAnalysis(result.analysis);
      setSelectedId(result.region.id);
      setFocusedCrop(null);
      setCropOpen(true);
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setPointError(error instanceof Error ? error.message : "Unable to analyze this point.");
    } finally {
      if (currentRequest === requestId.current) setPointLoading(false);
    }
  }, []);

  const exportCsv = useCallback(() => {
    if (!data) return;

    const header = [
      "region_id",
      "name",
      "taluk",
      "risk_score",
      "risk_class",
      "hazard_composite",
      "flood",
      "heat",
      "drought",
      "exposure",
      "vulnerability",
      "annual_rainfall_mm",
      "soil_ph",
      "soil_texture",
      "best_crop",
      "best_crop_score",
      "data_mode",
      "placeholder_note",
      "calculation_mode",
    ];
    const rows = (customRegion ? [...data.regions, customRegion] : data.regions).map((region) => {
      const result = computations[region.id];
      const analysis = customAnalysis?.areaId === region.id ? customAnalysis : data.areaAnalysis[region.id];
      const topCrop = analysis?.cropSuitability[0];
      return [
        region.id,
        region.name,
        region.taluk,
        result.score,
        result.riskClass,
        result.hazardComposite,
        Math.round(result.adjustedHazards.flood),
        Math.round(result.adjustedHazards.heat),
        Math.round(result.adjustedHazards.drought),
        region.exposure,
        region.vulnerability,
        analysis?.climate.annualRainfallMm ?? "",
        analysis?.soil.ph ?? "",
        analysis?.soil.texture ?? "",
        topCrop?.crop ?? "",
        topCrop?.score ?? "",
        analysis?.dataMode ?? "",
        region.notes,
        scenarioEnabled ? "Custom scenario" : "Default assessment",
      ].map(csvEscape).join(",");
    });

    downloadBlob("agricultural-climate-risk-analysis.csv", [header.join(","), ...rows].join("\n"), "text/csv");
  }, [computations, data, customRegion, customAnalysis, scenarioEnabled]);

  const exportPdf = useCallback(async () => {
    if (!selectedRegion || !selectedComputation) return;

    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Agricultural Climate Risk Report", 14, 18);
    doc.setFontSize(10);
    doc.text("BAIP508 - Karnataka / India point-ready analysis", 14, 26);
    doc.text("Public climate/soil indicators; rule-based crop ranking and estimated risk inputs.", 14, 32);
    doc.text(scenarioEnabled ? "Calculation: Custom scenario assumptions" : "Calculation: Default assessment", 14, 38);

    doc.setFontSize(12);
    doc.text(selectedRegion.name, 14, 44);
    doc.setFontSize(10);
    doc.text(`Taluk/Ward: ${selectedRegion.taluk}`, 14, 52);
    doc.text(`Risk Index: ${selectedComputation.score}/100 (${selectedComputation.riskClass})`, 14, 58);
    doc.text(`Hazard: ${selectedComputation.hazardComposite}/100`, 14, 64);
    doc.text(`Exposure: ${selectedRegion.exposure}/100`, 14, 70);
    doc.text(`Vulnerability: ${selectedRegion.vulnerability}/100`, 14, 76);
    doc.text(`Flood: ${Math.round(selectedComputation.adjustedHazards.flood)}`, 14, 86);
    doc.text(`Heat stress: ${Math.round(selectedComputation.adjustedHazards.heat)}`, 14, 92);
    doc.text(`Drought / water stress: ${Math.round(selectedComputation.adjustedHazards.drought)}`, 14, 98);

    const analysis = customAnalysis && selectedRegion.id === customAnalysis.areaId
      ? customAnalysis
      : data?.areaAnalysis[selectedRegion.id];
    if (analysis) {
      doc.text(`Rainfall: ${analysis.climate.annualRainfallMm} mm; Avg temp: ${analysis.climate.avgTempC} C`, 14, 106);
      doc.text(`Soil: pH ${analysis.soil.ph}, ${analysis.soil.texture}, ${analysis.soil.fertility} fertility`, 14, 112);
      doc.text(`Best crop: ${analysis.cropSuitability[0].crop} (${analysis.cropSuitability[0].score}/100)`, 14, 118);
    }

    const adviceY = analysis ? 130 : 110;
    doc.text("Advice:", 14, adviceY);
    doc.text(doc.splitTextToSize(analysis?.recommendationSummary ?? selectedRegion.advice, 180), 14, adviceY + 6);
    doc.text("Limitation: Screening aid only; not a certified agricultural, insurance or disaster model.", 14, 156);
    doc.save(`${selectedRegion.id}-agri-climate-risk-report.pdf`);
  }, [customAnalysis, data?.areaAnalysis, selectedComputation, selectedRegion, scenarioEnabled]);

  if (loadError) {
    return (
      <main className="center-state">
        <AlertTriangle size={34} />
        <h1>Data could not be loaded</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!data || !selectedRegion || !selectedComputation) {
    return (
      <main className="center-state">
        <Loader2 className="spin" size={34} />
        <h1>Loading agricultural climate risk data</h1>
      </main>
    );
  }

  const chartRows = data.regions.map((region) => ({
    name: shortName(region.name),
    score: computations[region.id].score,
    flood: Math.round(computations[region.id].adjustedHazards.flood),
    heat: Math.round(computations[region.id].adjustedHazards.heat),
    drought: Math.round(computations[region.id].adjustedHazards.drought),
  }));
  const selectedAnalysis = customAnalysis && selectedRegion.id === customAnalysis.areaId
    ? customAnalysis
    : data.areaAnalysis[selectedRegion.id];
  const crop = selectedAnalysis?.cropSuitability.find(c => c.crop === focusedCrop) ?? selectedAnalysis?.cropSuitability[0];
  const matchingRegions = data.regions.filter(region => `${region.name} ${region.taluk}`.toLowerCase().includes(search.toLowerCase()));
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const totalWeight = (Object.keys(weights) as HazardKey[]).reduce((sum, key) => sum + (toggles[key] ? weights[key] : 0), 0);
  const resetScenario = () => { setWeights(initialWeights); setToggles(initialToggles); setScenario({ rainfallDeltaPct: 0, temperatureDeltaC: 0 }); };

  return (
    <div className="app-shell">
      <nav className="nav-rail" aria-label="Dashboard navigation">
        <span className="rail-brand" title="Smart AgriClimate"><Leaf size={26} /></span>
        <button className="icon-button active" title="Area dashboard" onClick={() => jumpTo("map-section")}><LayoutDashboard size={21} /></button>
        <button className="icon-button" title="Crop recommendations" onClick={() => jumpTo("crop-ranking")}><Sprout size={21} /></button>
        <button className="icon-button" title="Hazards and scenarios" onClick={() => jumpTo("hazard-controls")}><SlidersHorizontal size={21} /></button>
        <button className="icon-button" title="Risk comparison" onClick={() => jumpTo("risk-comparison")}><BarChart3 size={21} /></button>
        <button className="icon-button" title="Sustainable development" onClick={() => jumpTo("sdg-content")}><Globe size={21} /></button>
        <button className="icon-button theme-toggle" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={21} /> : <Moon size={21} />}</button>
      </nav>
      <header className="topbar">
        <div className="brand-lockup">
          <span><Leaf size={28} /></span>
          <div>
            <p>Smart AgriClimate / BAIP508</p>
            <h1>Smart Agricultural Climate Risk Visualization</h1>
          </div>
        </div>
        <div className="header-location"><MapPinned size={15} /> Karnataka & India <span className="live-dot" /></div>
      </header>

      <main className="dashboard-grid">
        <section className="map-card" id="map-section">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Agricultural landscape</span>
              <h2>{pointPlace?.name ?? selectedRegion.taluk}</h2>
            </div>
            <button type="button" className="ghost-button" onClick={exportCsv}>
              <Download size={17} />
              Export
            </button>
          </div>
          <Suspense fallback={<div className="map-fallback">Loading map...</div>}>
            <RiskMap
              geojson={data.geojson}
              computations={computations}
              selectedId={selectedRegion.id}
              onSelect={handlePolygonSelect}
              onPointAnalyze={handlePointAnalyze}
              location={pointLocation ?? selectedRegion.centroid}
            />
          </Suspense>
          <span className="boundary-note">Sample area boundaries / public climate & soil</span>
          {cropOpen && crop && selectedAnalysis && !pointLoading ? <CropFocus crop={crop} analysis={selectedAnalysis} computation={selectedComputation} onClose={() => setCropOpen(false)} onExport={exportPdf} /> : null}
          <div className="point-status" aria-live="polite">
            {pointLoading ? <><Loader2 size={16} className="spin" /> Analyzing selected area...</> : null}
            {pointError ? `${pointPlace?.name ?? "Selected location"}: ${pointError}` : null}
          </div>
          <div className="legend-row">
            {(["Low", "Moderate", "High", "Very High"] as const).map((riskClass) => (
              <span key={riskClass}>
                <i style={{ background: riskColor(riskClass) }} />
                {riskClass}
              </span>
            ))}
          </div>
        </section>

        <div className={`area-sidebar ${pointLoading ? "is-loading" : ""}`}>
          <div className="area-search"><Search size={17} /><input aria-label="Search saved areas" placeholder="Search saved areas..." value={search} onChange={event => setSearch(event.target.value)} /></div>
          {search && <div className="search-results">{matchingRegions.map(region => <button key={region.id} onClick={() => { handlePolygonSelect(region.id); setSearch(""); }}>{region.name}<small>{region.taluk}</small></button>)}{!matchingRegions.length && <p>No saved area found. Select a point on the map.</p>}</div>}
          {pointLoading && <p className="sidebar-status" role="status">Fetching climate and soil for {pointLocation?.map(n => n.toFixed(3)).join(", ")}. Previous area shown below.</p>}
        <DetailsPanel
          region={selectedRegion}
          computation={selectedComputation}
          analysis={selectedAnalysis}
          onExportCsv={exportCsv}
          onExportPdf={exportPdf}
          onCropSelect={name => { setFocusedCrop(name); setCropOpen(true); jumpTo("map-section"); }}
          scenarioEnabled={scenarioEnabled}
        />
        </div>

        <section className="control-card" id="hazard-controls">
          <div className="section-title-row"><h2><SlidersHorizontal size={20} /> Risk assessment settings</h2>
            <label className="scenario-toggle"><input type="checkbox" checked={scenarioEnabled} onChange={event => { setScenarioEnabled(event.target.checked); if (!event.target.checked) resetScenario(); }} /> Scenario mode</label>
          </div>
          <p className="settings-explanation">Default assessment uses Flood 34%, Heat stress 33% and Water stress 33% importance. These are model assumptions, not measured hazard levels.</p>
          <p className="settings-explanation">{scenarioEnabled ? "Custom scenario: changing importance or climate assumptions updates risk estimates only. Climate/soil observations and crop rankings remain unchanged." : "Enable Scenario mode to explore alternative assumptions. The default assessment stays fixed while this mode is off."}</p>
          <fieldset className="scenario-fields" disabled={!scenarioEnabled}>
          <legend>Hazard importance</legend>
          <div className="control-list">
            {(Object.keys(weights) as HazardKey[]).map((key) => (
              <div className="control-row" key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={toggles[key]}
                    disabled={toggles[key] && Object.values(toggles).filter(Boolean).length === 1}
                    onChange={(event) => setToggles((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  {hazardLabels[key]}
                </label>
                <input
                  type="range"
                  aria-label={`${hazardLabels[key]} importance`}
                  min="0.01"
                  max="1"
                  step="0.01"
                  value={weights[key]}
                  onChange={(event) => updateWeight(key, Number(event.target.value))}
                />
                <strong>{toggles[key] ? Math.round(weights[key] / totalWeight * 100) : 0}%</strong>
              </div>
            ))}
          </div>

          <div className="what-if">
            <h3>What-if Scenario</h3>
            <label>
              Rainfall change: <strong>{scenario.rainfallDeltaPct > 0 ? "+" : ""}{scenario.rainfallDeltaPct}%</strong>
              <input
                type="range"
                min="-20"
                max="40"
                step="1"
                value={scenario.rainfallDeltaPct}
                onChange={(event) => setScenario((current) => ({ ...current, rainfallDeltaPct: Number(event.target.value) }))}
              />
            </label>
            <label>
              Temperature change: <strong>+{scenario.temperatureDeltaC.toFixed(1)} C</strong>
              <input
                type="range"
                min="0"
                max="4"
                step="0.1"
                value={scenario.temperatureDeltaC}
                onChange={(event) => setScenario((current) => ({ ...current, temperatureDeltaC: Number(event.target.value) }))}
              />
            </label>
          </div>
          <button className="ghost-button" onClick={resetScenario} type="button"><RotateCcw size={15} /> Reset assumptions</button>
          </fieldset>
        </section>

        <section className="chart-card" id="risk-comparison">
          <div className="section-title-row">
            <h2><Gauge size={20} /> Saved Area Risk Comparison</h2>
            <span>{scenarioEnabled ? "Custom scenario" : "Default assessment"} / saved areas</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="score" name="Risk index" fill="var(--chart-score)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="flood" name="Flood" fill="var(--chart-flood)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="heat" name="Heat stress" fill="var(--chart-heat)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="drought" name="Water stress" fill="var(--chart-drought)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <DecisionTabs support={selectedRegion.decisionSupport} />
        <div id="sdg-content"><SdgPanel /></div>

        <section className="method-card">
          <h2>Analysis Coverage</h2>
          <p>
            Saved areas combine public climate and soil indicators with sample risk and exposure inputs.
            Point selections use NASA POWER annual climate and SoilGrids surface soil estimates. Recommendations
            assess crop suitability, not guaranteed yields. Nearby fields may differ from these coarse data grids.
          </p>
          <p>
            Current formula: hazard scores are adjusted by the what-if sliders, combined by enabled user weights, then
            multiplied by exposure and vulnerability to create a 0-100 Agricultural Climate Risk Index.
          </p>
        </section>
      </main>
    </div>
  );
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function shortName(name: string) {
  return name
    .replace(" Agricultural Belt", "")
    .replace(" Horticulture Zone", "")
    .replace(" Vegetable Cluster", "")
    .replace(" Millet and Floriculture Belt", "")
    .replace(" Rainfed Farms", "")
    .replace(" Mixed Cropping Zone", "")
    .replace(" Dryland Interface", "")
    .replace(" Peri-Urban Farms", "");
}
