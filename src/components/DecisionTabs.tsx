import { CalendarDays, Droplets, Flame, Gauge, Sprout, Waves } from "lucide-react";
import { useState } from "react";
import type { DecisionSupport } from "../types";

interface DecisionTabsProps {
  support: DecisionSupport;
}

const tabs = [
  { key: "cropPlanning", label: "Crop Planning", icon: Sprout },
  { key: "irrigationPlanning", label: "Irrigation", icon: Droplets },
  { key: "sowingWindow", label: "Sowing Window", icon: CalendarDays },
  { key: "floodPreparedness", label: "Flood Prep", icon: Waves },
  { key: "heatStress", label: "Heat Stress", icon: Flame },
  { key: "riskMonitoring", label: "Monitoring", icon: Gauge },
] as const;

export default function DecisionTabs({ support }: DecisionTabsProps) {
  const [active, setActive] = useState<(typeof tabs)[number]["key"]>("cropPlanning");
  const activeTab = tabs.find((tab) => tab.key === active)!;
  const Icon = activeTab.icon;

  return (
    <section className="decision-section">
      <div className="section-title-row">
        <h2>Decision Support</h2>
        <span>Location-specific recommendations</span>
      </div>
      <div className="decision-tabs" role="tablist">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              className={tab.key === active ? "active" : ""}
              onClick={() => setActive(tab.key)}
            >
              <TabIcon size={17} />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="decision-card">
        <h3><Icon size={18} /> {activeTab.label}</h3>
        <ul>
          {support[active].map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  );
}
