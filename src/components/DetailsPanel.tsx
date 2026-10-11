import { CloudRain, Droplets, FileDown, MapPin, Sprout, Sun, Thermometer, Wind } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AreaAnalysis, RiskComputation, RiskRegion } from "../types";
import { riskColor } from "../risk";

interface DetailsPanelProps {
  region: RiskRegion; computation: RiskComputation; analysis?: AreaAnalysis;
  onExportCsv: () => void; onExportPdf: () => void; onCropSelect: (crop: string) => void;
  scenarioEnabled: boolean;
}

export default function DetailsPanel({ region, computation, analysis, onExportCsv, onExportPdf, onCropSelect, scenarioEnabled }: DetailsPanelProps) {
  const climate = analysis?.climate;
  const soil = analysis?.soil;
  const factors = region.shapFactors.map(factor => ({ name: factor.feature, value: factor.direction === "reduces" ? -factor.contribution : factor.contribution }));
  return <aside className="detail-panel" aria-label="Selected area conditions">
    <section className="area-heading">
      <div className="area-title"><MapPin size={15} /><h2>{region.name}</h2></div>
      <div className="area-subtitle"><span>{region.taluk}</span><span>{analysis ? new Date(analysis.generatedAt).toLocaleDateString() : "Sample area"}</span></div>
      {region.id.startsWith("custom-") && <p className="coordinate-note">{region.centroid.map(n => n.toFixed(4)).join(", ")} · Nearest mapped locality</p>}
    </section>
    <section className="condition-summary">
      <span className="eyebrow">Area conditions</span><p>{analysis?.recommendationSummary ?? region.advice}</p>
      <div className="action-row"><Droplets size={16} /><span>Drainage</span><strong>{soil?.drainage ?? "Unavailable"}</strong></div>
      <div className="action-row"><Sprout size={16} /><span>Soil fertility</span><strong>{soil?.fertility ?? "Unavailable"}</strong></div>
      <div className="action-row"><Thermometer size={16} /><span>Heat-stress days</span><strong>{climate?.heatStressDays ?? "—"} / year</strong></div>
    </section>
    <div className="overview-grid">
      <section className="overview-tile"><span className="eyebrow">{scenarioEnabled ? "Scenario risk index" : "Climate risk index"}</span><div className="big-value">{computation.score}<small> / 100</small></div><span className="risk-label" style={{ color: riskColor(computation.riskClass) }}>{computation.riskClass}</span><div className="spectrum"><i style={{ left: `${computation.score}%` }} /></div></section>
      <section className="overview-tile"><span className="eyebrow">Annual climate</span><div className="big-value">{climate?.avgTempC ?? "—"}<small> °C</small><Sun size={19} /></div><div className="weather-meta"><span><Droplets size={12} /> {climate?.avgHumidityPct ?? "—"}%</span><span><Wind size={12} /> {climate?.avgWindMs ?? "—"} m/s</span></div><small className="muted">Annual mean, not current weather</small></section>
    </div>
    <section className="crop-ranking" id="crop-ranking"><div className="section-title-row"><h3>Crop recommendations</h3><Sprout size={16} /></div>
      <div className="ranking-list">{analysis?.cropSuitability.map((crop, index) => <button key={crop.crop} className="ranking-row" onClick={() => onCropSelect(crop.crop)} title={`View ${crop.crop} recommendation`}>
        <span className="ranking-number">{String(index + 1).padStart(2, "0")}</span><div><div className="ranking-label"><strong>{crop.crop}</strong><span>{crop.score}%</span></div><div className="segmented-meter" style={{ "--fill": `${crop.score}%` } as CSSProperties}><i /></div><small>{crop.waterNeed} water need · {crop.season}</small></div>
      </button>) ?? <p>Crop data unavailable for this area.</p>}</div>
    </section>
    <div className="indicator-stack">
      <Indicator icon={<CloudRain size={19} />} value={climate ? `${climate.annualRainfallMm} mm` : "Unavailable"} label="Annual rainfall" />
      <Indicator icon={<Sprout size={19} />} value={soil ? `${soil.ph} pH · ${soil.texture}` : "Unavailable"} label="Surface soil conditions" />
      <Indicator icon={<Droplets size={19} />} value={soil ? `${soil.nitrogenGkg} g/kg` : "Unavailable"} label="Soil nitrogen" />
    </div>
    <section className="area-insights"><span className="eyebrow">Agricultural insights</span><p>{region.advice}</p><div className="insight-grid"><div><span>Water stress</span><strong>{Math.round(computation.adjustedHazards.drought)} / 100</strong></div><div><span>Flood hazard</span><strong>{Math.round(computation.adjustedHazards.flood)} / 100</strong></div></div></section>
    <details className="more-analysis"><summary>Soil & climate details</summary><div className="profile-grid">
      <Metric label="Organic carbon" value={soil?.organicCarbonGkg} suffix="g/kg" /><Metric label="CEC" value={soil?.cecCmolKg} suffix="cmol/kg" />
      <Metric label="Clay" value={soil?.clayPct} suffix="%" /><Metric label="Sand" value={soil?.sandPct} suffix="%" />
      <Metric label="Monsoon rainfall" value={climate?.monsoonRainfallMm} suffix="mm" /><Metric label="Days below 1 mm rain" value={climate?.drySpellDays} />
      <Metric label="Maximum temperature" value={climate?.maxTempC} suffix="°C" /><Metric label="Minimum temperature" value={climate?.minTempC} suffix="°C" />
    </div></details>
    <details className="more-analysis"><summary>Risk contributing factors</summary><p className="muted">Illustrative contributions; not trained-model SHAP values.</p><ResponsiveContainer width="100%" height={230}><BarChart data={factors} layout="vertical" margin={{ right: 15 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" fill="#85b77c" /></BarChart></ResponsiveContainer></details>
    <details className="more-analysis"><summary>Data sources & coverage</summary><p>{analysis?.dataMode === "real-api" ? "Public climate and soil data. Crop rankings and risk calculations are rule-based estimates." : "Includes estimated/sample indicators."}</p>{analysis?.sources.map(source => <p key={source}>{source}</p>)}<p>{region.notes}</p>{analysis?.surroundings.notes.map(note => <p key={note}>{note}</p>)}<p>Soil moisture, phosphorus, potassium and pest observations are unavailable.</p></details>
    <div className="export-row"><button onClick={onExportCsv}><FileDown size={15} /> CSV</button><button onClick={onExportPdf}><FileDown size={15} /> PDF</button></div>
    <p className="screening-note">Screening aid, not certified. Confirm crop choices with local agronomic advice.</p>
    {region.id.startsWith("custom-") && <p className="screening-note">Place names: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> / Photon.</p>}
  </aside>;
}
function Indicator({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return <div className="area-indicator"><span className="indicator-icon">{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}
function Metric({ label, value, suffix = "" }: { label: string; value?: number; suffix?: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value ?? "—"}<small> {suffix}</small></strong></div>;
}
