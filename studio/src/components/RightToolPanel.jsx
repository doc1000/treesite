export default function RightToolPanel({ selectedNode }) {
  const node = selectedNode ?? {};
  const displayName = node.name || node.title || "—";
  const nodeType = node.type || "—";
  const description = node.description ?? "";
  const valueField = node.value != null ? String(node.value) : "";
  const slug = node.slug ?? "";

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
        <div className="action-list">
          <button type="button" onClick={() => {}}>Rename</button>
          <button type="button" onClick={() => {}}>Move</button>
          <button type="button" onClick={() => {}}>Hide</button>
          <button type="button" className="danger" onClick={() => {}}>Delete</button>
        </div>
      </form>
    </>
  );
}
