export default function RightToolPanel({ selectedNode, nodeItem }) {
  // Prefer the richer nodeItem (from get-node) over the manifest-derived selectedNode
  const node = selectedNode ?? {};
  const item = nodeItem ?? node;
  const displayName = item.name || item.title || "—";
  const nodeType = item.type || "—";
  const description = item.description ?? "";
  const valueField = node.value != null ? String(node.value) : "";
  const slug = item.slug ?? "";
  const nodeId = item.id ?? "";

  return (
    <>
      <div className="panel-header">
        <h2>Edit Tools</h2>
        <span aria-hidden="true">↔</span>
      </div>
      <div className="selected-title">
        <b>▰</b>
        <b>Selected: {displayName}</b>
        <span style={{ marginLeft: "auto", color: "var(--muted)" }}>×</span>
      </div>
      <div className="tabs-small">
        <button type="button" className="active">Content</button>
        <button type="button">Style</button>
        <button type="button">Behavior</button>
        <button type="button">Advanced</button>
      </div>
      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <div className="field">
          <label htmlFor="field-name">Name</label>
          <input id="field-name" value={displayName} readOnly />
        </div>
        <div className="field">
          <label htmlFor="field-description">Description</label>
          <textarea id="field-description" value={description} readOnly />
        </div>
        <div className="field">
          <label htmlFor="field-type">Type</label>
          <select id="field-type" value={nodeType} readOnly>
            <option value={nodeType}>{nodeType}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="field-value">Value</label>
          <input id="field-value" value={valueField} readOnly />
        </div>
        <div className="field">
          <label htmlFor="field-slug">Slug</label>
          <input id="field-slug" value={slug} readOnly />
        </div>
        {nodeId && (
          <div className="field">
            <label htmlFor="field-id">ID</label>
            <input id="field-id" value={nodeId} readOnly style={{ fontSize: 10 }} />
          </div>
        )}
        <div className="action-list">
          <button type="button" onClick={() => {}}>Rename</button>
          <button type="button" onClick={() => {}}>Move</button>
          <button type="button" onClick={() => {}}>Hide</button>
          <button type="button" className="danger" onClick={() => {}}>Delete</button>
        </div>
      </form>

      {nodeItem && (
        <details style={{ margin: "8px 0 0" }}>
          <summary
            style={{
              cursor: "pointer",
              color: "var(--muted)",
              fontSize: 11,
              padding: "4px 0",
              userSelect: "none",
            }}
          >
            items/{nodeItem.slug}.json (raw)
          </summary>
          <pre
            style={{
              background: "var(--bg3, #141414)",
              padding: 8,
              borderRadius: 4,
              overflow: "auto",
              maxHeight: 180,
              fontSize: 10,
              color: "var(--text)",
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {JSON.stringify(nodeItem, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
}
