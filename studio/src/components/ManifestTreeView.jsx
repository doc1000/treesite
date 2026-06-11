import { useCallback, useEffect, useRef, useState } from "react";
import { INTENTS } from "../nav/intents.js";
import { typeBadgeClass } from "../lib/manifestTree.js";

function nodeKey(node, depth) {
  return node.id ?? `depth-${depth}-${node.name}`;
}

function collectVisibleRows(manifest, expandedNodeIds) {
  const rows = [];
  const walkChildren = (children, parentKey, depth) => {
    for (const child of children ?? []) {
      const key = nodeKey(child, depth);
      const hasChildren = (child.children?.length ?? 0) > 0;
      const expanded = expandedNodeIds.has(key);
      rows.push({
        key,
        nodeId: child.id ?? null,
        parentKey,
        hasChildren,
        expanded,
      });
      if (hasChildren && expanded) {
        walkChildren(child.children, key, depth + 1);
      }
    }
  };

  rows.push({
    key: "root",
    nodeId: null,
    parentKey: null,
    hasChildren: (manifest.children?.length ?? 0) > 0,
    expanded: expandedNodeIds.has("root"),
  });
  if (expandedNodeIds.has("root")) {
    walkChildren(manifest.children, "root", 0);
  }
  return rows;
}

function TreeNode({
  node,
  depth,
  selectedNodeId,
  onSelectNode,
  expandedNodeIds,
  onToggleExpanded,
  focusedKey,
  rowKey,
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const expanded = expandedNodeIds.has(rowKey);
  const selected = node.id && node.id === selectedNodeId;
  const navFocus = focusedKey === rowKey;

  return (
    <li>
      <div
        className={`tree-node${selected ? " selected" : ""}${navFocus ? " nav-focus" : ""}`}
        data-tree-key={rowKey}
        onClick={() => node.id && onSelectNode(node.id)}
        role="button"
        tabIndex={navFocus ? 0 : -1}
      >
        {hasChildren ? (
          <button
            type="button"
            className="tree-expand"
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded(rowKey);
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
              key={child.id ?? `${rowKey}-${child.slug}`}
              node={child}
              depth={depth + 1}
              rowKey={nodeKey(child, depth + 1)}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              expandedNodeIds={expandedNodeIds}
              onToggleExpanded={onToggleExpanded}
              focusedKey={focusedKey}
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
  navigation,
}) {
  const rootLabel = manifest.displayName || manifest.name || "root";
  const rootExpanded = expandedNodeIds.has("root");
  const zoneRef = useRef(null);
  const [focusedKey, setFocusedKey] = useState("root");

  const rowsForNav = useCallback(
    () => collectVisibleRows(manifest, expandedNodeIds),
    [manifest, expandedNodeIds],
  );

  const focusRow = useCallback((key) => {
    setFocusedKey(key);
    requestAnimationFrame(() => {
      const el = zoneRef.current?.querySelector(`[data-tree-key="${key}"]`);
      el?.focus?.({ preventScroll: true });
    });
  }, []);

  const handleIntent = useCallback(
    (intent) => {
      const rows = rowsForNav();
      const idx = rows.findIndex((r) => r.key === focusedKey);
      const row = idx >= 0 ? rows[idx] : rows[0];
      if (!row) return;

      if (intent === INTENTS.UP) {
        if (idx > 0) focusRow(rows[idx - 1].key);
        return;
      }
      if (intent === INTENTS.DOWN) {
        if (idx >= 0 && idx < rows.length - 1) focusRow(rows[idx + 1].key);
        return;
      }
      if (intent === INTENTS.SELECT) {
        onSelectNode(row.nodeId);
        return;
      }
      if (intent === INTENTS.BACK) {
        if (row.parentKey) focusRow(row.parentKey);
        return;
      }
      if (intent === INTENTS.RIGHT) {
        if (row.hasChildren) {
          if (!row.expanded) {
            onToggleExpanded(row.key);
          } else {
            const childRow = rows.slice(idx + 1).find((r) => r.parentKey === row.key);
            if (childRow) focusRow(childRow.key);
          }
        }
        return;
      }
      if (intent === INTENTS.LEFT) {
        if (row.hasChildren && row.expanded) {
          onToggleExpanded(row.key);
        } else if (row.parentKey) {
          focusRow(row.parentKey);
        }
      }
    },
    [focusedKey, focusRow, onSelectNode, onToggleExpanded, rowsForNav],
  );

  useEffect(() => {
    if (!navigation) return undefined;
    navigation.registerZone("explorer", {
      onIntent: handleIntent,
      focus: () => focusRow(focusedKey || "root"),
    });
    return () => navigation.unregisterZone("explorer");
  }, [navigation, handleIntent, focusRow, focusedKey]);

  return (
    <div className="tree" ref={zoneRef}>
      <ul>
        <li>
          <div
            className={`tree-node${!selectedNodeId ? " selected" : ""}${focusedKey === "root" ? " nav-focus" : ""}`}
            data-tree-key="root"
            onClick={() => onSelectNode(null)}
            role="button"
            tabIndex={focusedKey === "root" ? 0 : -1}
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
                  rowKey={nodeKey(child, 0)}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                  expandedNodeIds={expandedNodeIds}
                  onToggleExpanded={onToggleExpanded}
                  focusedKey={focusedKey}
                />
              ))}
            </ul>
          ) : null}
        </li>
      </ul>
    </div>
  );
}
