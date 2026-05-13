import React, { useState } from "react";

export function TileTemplate({ node, box }) {
  const small = box.w < 170 || box.h < 110;
  const links = node.links || [];

  if (node.template === "schedule") {
    return <ScheduleTile node={node} box={box} small={small} />;
  }

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
            <TileLink key={link.href || link.label} link={link}>
              {link.label}
            </TileLink>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScheduleTile({ node, box, small }) {
  const [name, setName] = useState("");
  const [needs, setNeeds] = useState("");
  const [times, setTimes] = useState(["", "", ""]);
  const showForm = box.w >= 280 && box.h >= 280;
  const body = encodeURIComponent(
    `Name: ${name}

Preferred times:
1. ${times[0]}
2. ${times[1]}
3. ${times[2]}

What I need help with:
${needs}`
  );
  const href = `mailto:${node.email}?subject=${encodeURIComponent(
    "Schedule a call"
  )}&body=${body}`;

  if (!showForm) {
    return (
      <div className={`tile-html schedule-tile ${small ? "tile-small" : ""}`}>
        <div className="tile-card">
          <div>
            <div className="tile-kicker">Contact</div>
            <h3 className="tile-title">Schedule a Call</h3>
            <p className="tile-desc">{node.description}</p>
          </div>

          <div className="tile-visual" />

          <div className="tile-links">
            <span className="tile-link tile-link-preview">Open scheduler</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`tile-html schedule-tile ${small ? "tile-small" : ""}`}>
      <div className="tile-card schedule-card">
        <h3 className="tile-title">Schedule a Call</h3>

        <input
          placeholder="Your name"
          value={name}
          onClick={e => e.stopPropagation()}
          onChange={e => setName(e.target.value)}
        />

        {times.map((time, i) => (
          <input
            key={i}
            placeholder={`Preferred time ${i + 1}`}
            value={time}
            onClick={e => e.stopPropagation()}
            onChange={e => {
              const next = [...times];
              next[i] = e.target.value;
              setTimes(next);
            }}
          />
        ))}

        <textarea
          placeholder="Briefly describe your needs"
          value={needs}
          onClick={e => e.stopPropagation()}
          onChange={e => setNeeds(e.target.value)}
        />

        <a className="tile-link" href={href} onClick={e => e.stopPropagation()}>
          Open email
        </a>
      </div>
    </div>
  );
}

function ContactTile({ node, small }) {
  return (
    <div className={`tile-html contact-tile ${small ? "tile-small" : ""}`}>
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
            <TileLink key={link.href} link={link}>
              {link.label}
            </TileLink>
          ))}
        </div>
      </div>
    </div>
  );
}

function TileLink({ link, children }) {
  const isMailto = link.href?.startsWith("mailto:");

  return (
    <a
      className="tile-link"
      href={link.href}
      target={isMailto ? undefined : "_blank"}
      rel={isMailto ? undefined : "noreferrer"}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </a>
  );
}