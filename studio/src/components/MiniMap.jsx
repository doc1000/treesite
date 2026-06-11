export default function MiniMap({ sections }) {
  const totalValue = sections.reduce((sum, s) => sum + (s.value ?? 1), 0) || 1;
  let xOffset = 0;

  const blocks = sections.map((section) => {
    const fraction = (section.value ?? 1) / totalValue;
    const widthPct = fraction * 100;
    const block = {
      id: section.id,
      left: xOffset,
      width: widthPct,
      color: section.color || "rgba(53,120,255,.55)",
    };
    xOffset += widthPct;
    return block;
  });

  return (
    <section className="minimap-wrap">
      <div className="minimap-title">Mini-map</div>
      <div className="minimap" aria-label="Treemap minimap overview">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="mini"
            style={{
              left: `${block.left}%`,
              top: "0",
              width: `${block.width}%`,
              height: "100%",
              background: block.color,
            }}
          />
        ))}
        <div className="viewport" />
      </div>
      <div className="mini-controls">
        <button type="button" onClick={() => {}}>−</button>
        <button type="button" onClick={() => {}}>+</button>
        <span>100% · Fit View</span>
      </div>
    </section>
  );
}
