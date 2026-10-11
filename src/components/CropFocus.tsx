import { Droplets, FileDown, Sprout, Thermometer, X } from "lucide-react";
import type { AreaAnalysis, CropRecommendation, RiskComputation } from "../types";

export default function CropFocus({ crop, analysis, computation, onClose, onExport }: {
  crop: CropRecommendation; analysis: AreaAnalysis; computation: RiskComputation;
  onClose: () => void; onExport: () => void;
}) {
  return <article className="crop-focus">
    <header><div><span className="eyebrow">Recommended crop</span><h2><Sprout size={19} /> {crop.crop}</h2></div>
      <button className="icon-button" title="Close crop recommendation" onClick={onClose}><X size={17} /></button></header>
    <p className="crop-season">{crop.season} / {crop.waterNeed.toLowerCase()} water need</p>
    <div className="focus-score"><span>Crop suitability</span><strong>{crop.score}<small> / 100</small></strong></div>
    <div className="spectrum"><i style={{ left: `${crop.score}%` }} /></div>
    <p className="focus-description">{crop.expectedEfficiency}. {crop.reasons[0]}</p>
    <div className="focus-metrics">
      <div><Thermometer size={18} /><span><strong>{analysis.climate.avgTempC} °C</strong><small>Annual mean</small></span></div>
      <div><Droplets size={18} /><span><strong>{analysis.climate.annualRainfallMm} mm</strong><small>Annual rainfall</small></span></div>
      <div><Sprout size={18} /><span><strong>{analysis.soil.ph} pH</strong><small>Surface soil</small></span></div>
      <div><Droplets size={18} /><span><strong>{Math.round(computation.adjustedHazards.drought)} / 100</strong><small>Water stress estimate</small></span></div>
    </div>
    <div className="crop-alert"><Sprout size={24} /><p>{crop.warnings[0] || "Confirm suitability with local field observations."}</p></div>
    <footer><span>Rule-based suitability</span><button className="ghost-button" onClick={onExport}><FileDown size={15} /> Report</button></footer>
  </article>;
}
