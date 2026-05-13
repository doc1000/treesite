import React from "react";

export function TileTemplate({ node, box }) {
  const small = box.w < 170 || box.h < 110;
  const links = node.links || [];

  if (node.template === "contact") {
    return <ContactTile node={node} small={small} />;
  }

  return (
    <div className={`tile-html ${small ? "tile-small" : ""}`}>
      <div className="tile-card">
        <div>
          <div className="tile-kicker">{node.kicker || "Section"}</div>
          <h3 className="tile-title">{node.name}</h3>
          <p className="tile-desc">{node.description}</p>
        </div>

        {node.image ? (
          <img className="tile-image" src={node.image} alt="" />
        ) : (
          <div className="tile-visual" />
        )}

        <div className="tile-links">
          {links.slice(0, 3).map(link => (
            <span key={link.href || link.label} className="tile-link">
              {link.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ContactTile({ node, small }) {
  return (
    <div className={`tile-html ${small ? "tile-small" : ""}`}>
      <div className="tile-card">
        <div>
          <div className="tile-kicker">Contact</div>
          <h3 className="tile-title">{node.name}</h3>
          <p className="tile-desc">
            {node.description || "Need AI knowledge tools now? Reach out."}
          </p>
        </div>

        <div className="tile-links">
          {(node.links || []).map(link => (
            <span key={link.href} className="tile-link">
              {link.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}