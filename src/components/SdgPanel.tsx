const goals = [
  {
    id: "SDG 2",
    title: "Zero Hunger",
    priority: true,
    text: "Supports climate-resilient agriculture and productivity protection.",
  },
  {
    id: "SDG 13",
    title: "Climate Action",
    priority: true,
    text: "Improves climate-hazard awareness, adaptation and resilience planning.",
  },
  {
    id: "SDG 6",
    title: "Clean Water and Sanitation",
    priority: false,
    text: "Supports better agricultural water-resource planning.",
  },
  {
    id: "SDG 9",
    title: "Industry, Innovation and Infrastructure",
    priority: false,
    text: "Uses AI, geospatial data and open-source visualization.",
  },
  {
    id: "SDG 12",
    title: "Responsible Consumption and Production",
    priority: false,
    text: "Encourages efficient use of water, inputs and farm resources.",
  },
];

export default function SdgPanel() {
  return (
    <section className="sdg-section">
      <div className="section-title-row">
        <h2>SDG Mapping</h2>
        <span>SDG 2 and 13 are the primary goals</span>
      </div>
      <div className="sdg-grid">
        {goals.map((goal) => (
          <article className={goal.priority ? "sdg-card priority" : "sdg-card"} key={goal.id}>
            <strong>{goal.id}</strong>
            <h3>{goal.title}</h3>
            <p>{goal.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
