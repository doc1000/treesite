/**
 * useStudioOps — named operations for the studio.
 *
 * Each op calls one or more API tools, then invokes refreshArtifact so the
 * manifest and selected-node state stay in sync. The UI only needs to handle
 * busy/error state; the mechanics live here.
 *
 * Container-by-composition (addChild):
 *   - If the target is already a section, add the child under it.
 *   - If the target is a content card, promote it to a section first (edit-card
 *     type→section), then add the child. The original content fields stay on the
 *     JSON for Phase 4 mapFace rendering; they are not stripped.
 */
import {
  addCard,
  editCard,
  renameCard,
  moveCard,
  moveSubtree,
  hideCard,
  unhideCard,
  deleteCard,
} from "../api/client.js";

/**
 * Returns the section path that children of a given node should have.
 * Mirrors the add-card tool's section-path convention.
 */
export function getNodeSectionPath(node) {
  if (!node.section || node.section === "Home") return node.name;
  return `${node.section}/${node.name}`;
}

/**
 * Collect all section paths from the manifest tree.
 * Returns array of strings, root ("Home") first.
 */
export function collectSectionPaths(node, paths = []) {
  if (paths.length === 0) paths.push("Home");
  for (const child of node.children ?? []) {
    if (child.type === "section") {
      paths.push(getNodeSectionPath(child));
      collectSectionPaths(child, paths);
    }
  }
  return paths;
}

/**
 * useStudioOps(artifactName, refreshArtifact)
 *
 * Returns an object of async ops. Each throws on failure (the caller should
 * catch and display the error).
 */
export function useStudioOps(artifactName, refreshArtifact) {
  /**
   * Save field edits for the selected card.
   * fields = { name, description, value, url, href, email, ... }
   */
  async function saveFields(id, fields) {
    await editCard(artifactName, id, fields);
    await refreshArtifact();
  }

  /**
   * Rename a card — updates both slug/file and display name.
   * If newName === oldName, only calls editCard for other field changes.
   */
  async function renameNode(id, oldSlug, newName, otherFields = {}) {
    const slug = newName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    // rename-card updates the file and slug
    if (slug !== oldSlug) {
      await renameCard(artifactName, { id, newSlug: slug, newName });
    }
    if (Object.keys(otherFields).length > 0) {
      await editCard(artifactName, id, { name: newName, ...otherFields });
    } else {
      await editCard(artifactName, id, { name: newName });
    }
    await refreshArtifact();
  }

  /**
   * Move a leaf card to a new section path.
   */
  async function moveNode(id, newSection) {
    await moveCard(artifactName, { id, section: newSection });
    await refreshArtifact();
  }

  /**
   * Move a section subtree to a new parent section path.
   */
  async function moveSubtreeNode(id, newSection) {
    await moveSubtree(artifactName, { id, newSection });
    await refreshArtifact();
  }

  /**
   * Hide or unhide a card.
   */
  async function setVisibility(id, visible) {
    if (visible) {
      await unhideCard(artifactName, id);
    } else {
      await hideCard(artifactName, id);
    }
    await refreshArtifact();
  }

  /**
   * Delete a card.
   */
  async function removeNode(id) {
    await deleteCard(artifactName, id);
    await refreshArtifact({ afterDelete: true });
  }

  /**
   * Add a basic card (text/section/link/contact/href).
   * `spec` = { name, type, section, description, url, href, email, value }
   */
  async function addBasicCard(spec) {
    await addCard(artifactName, spec);
    await refreshArtifact();
  }

  /**
   * Add a child to a target node — the compose-based container model.
   *
   * If `targetNode` is already a section: add the child under it directly.
   * If `targetNode` is a content card: promote it to section type first,
   * then add the child. Original content fields are preserved as the node's
   * face (used by Phase 4 mapFace). No engine rewrite needed.
   *
   * @param {object} targetNode - The node to add a child under (from manifest).
   * @param {object} childSpec  - { name, type, section?, ... } (section is auto-set).
   * @param {Function} [intakeOp] - Optional async function(section) for PDF/HTML/website intakes.
   */
  async function addChild(targetNode, childSpec, intakeOp = null) {
    const isSection = targetNode.type === "section";
    let sectionPath;

    if (isSection) {
      sectionPath = getNodeSectionPath(targetNode);
    } else {
      // Promote content card to section
      await editCard(artifactName, targetNode.id, { type: "section" });
      sectionPath = getNodeSectionPath(targetNode);
    }

    if (intakeOp) {
      await intakeOp(sectionPath);
    } else {
      await addCard(artifactName, { ...childSpec, section: sectionPath });
    }

    await refreshArtifact();
  }

  return {
    saveFields,
    renameNode,
    moveNode,
    moveSubtreeNode,
    setVisibility,
    removeNode,
    addBasicCard,
    addChild,
  };
}
