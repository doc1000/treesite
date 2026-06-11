import { typeBadgeClass } from "../lib/manifestTree.js";

function TreeNode({
  node,
  depth,
  selectedNodeId,
  onSelectNode,
  expandedNodeIds,
  onToggleExpanded,
}) {
  const nodeKey = node.id ?? `depth-${depth}-${node.name}`;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const expanded = expandedNodeIds.has(nodeKey);
  const selected = node.id && node.id === selectedNodeId;

  return (
    <li>
      <div
        className={`tree-node${selected ? " selected" : ""}`}
        onClick={() => node.id && onSelectNode(node.id)}
        role="button"
        tabIndex={0}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-expand"
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded(nodeKey);
            }}
          >
            {expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-expand" />
        )}
        {node.type ? (
          <span className={`badge ${typeBadgeClass(node.type)}`} aria-hidden="true" />
        ) : null}
        <span>{node.name || node.title || node.slug}</span>
        {node.type ? <span className="type-badge">{node.type}</span> : null}
      </div>
      {hasChildren && expanded ? (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id ?? `${nodeKey}-${child.slug}`}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              expandedNodeIds={expandedNodeIds}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function ManifestTreeView({
  manifest,
  selectedNodeId,
  onSelectNode,
  expandedNodeIds,
  onToggleExpanded,
}) {
  const rootLabel = manifest.displayName || manifest.name || "root";
  const rootExpanded = expandedNodeIds.has("root");

  return (
    <div className="tree">
      <ul>
        <li>
          <div
            className={`tree-node${!selectedNodeId ? " selected" : ""}`}
            onClick={() => onSelectNode(null)}
            role="button"
            tabIndex={0}
          >
            <button
              type="button"
              className="tree-expand"
              aria-expanded={rootExpanded}
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpanded("root");
              }}
            >
              {rootExpanded ? "▾" : "▸"}
            </button>
            <span className="badge b-blue" aria-hidden="true" />
            <span>{rootLabel}</span>
          </div>
          {rootExpanded ? (
            <ul>
              {(manifest.children ?? []).map((child) => (
                <TreeNode
                  key={child.id}
                  node={child}
                  depth={0}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                  expandedNodeIds={expandedNodeIds}
                  onToggleExpanded={onToggleExpanded}
                />
              ))}
            </ul>
          ) : null}
        </li>
      </ul>
    </div>
  );
}
