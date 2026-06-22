import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findNodeInTree,
  layoutTreeAtDrill,
  shouldNavigateMainOnCellClick,
  captionForModes,
} from "../../../shared/treesite-map/minimap-utils.js";

const tree = {
  id: "root",
  name: "Home",
  children: [
    {
      id: "sec-a",
      name: "Section A",
      children: [{ id: "card-1", name: "Card 1", value: 1 }],
    },
    { id: "sec-b", name: "Section B", value: 2 },
  ],
};

test("findNodeInTree resolves by id", () => {
  assert.equal(findNodeInTree(tree, "card-1")?.name, "Card 1");
  assert.equal(findNodeInTree(tree, "missing"), null);
});

test("layoutTreeAtDrill uses section children when drilled", () => {
  const atRoot = layoutTreeAtDrill(tree, null);
  assert.equal(atRoot.id, "root");

  const atSection = layoutTreeAtDrill(tree, "sec-a");
  assert.equal(atSection.id, "sec-a");
  assert.equal(atSection.children.length, 1);
});

test("explore mode does not navigate main on repeat click", () => {
  assert.equal(shouldNavigateMainOnCellClick("explore", true), false);
  assert.equal(shouldNavigateMainOnCellClick("explore", false), false);
  assert.equal(shouldNavigateMainOnCellClick("click-jump", true), true);
  assert.equal(shouldNavigateMainOnCellClick("click-jump", false), false);
});

test("captionForModes respects label mode", () => {
  assert.equal(
    captionForModes({ labelMode: "hover", hoverName: "H", selectedName: "S" }),
    "H",
  );
  assert.equal(
    captionForModes({ labelMode: "select", hoverName: "H", selectedName: "S" }),
    "S",
  );
  assert.equal(captionForModes({ labelMode: "off", hoverName: "H", selectedName: "S" }), "");
});
