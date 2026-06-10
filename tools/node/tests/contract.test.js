import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { copyArtifactToTemp, exampleArtifact, runTool } from "./test-helpers.js";

const WHAT_IS_TREESITE_ID = "a1000001-0000-4000-8000-000000000011";
const SEC_ABOUT_ID = "a1000001-0000-4000-8000-000000000001";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000099";

test("get_node returns item for known id", () => {
  const { json, status } = runTool("get-node", exampleArtifact, { id: WHAT_IS_TREESITE_ID });
  assert.equal(status, 0);
  assert.equal(json.ok, true);
  assert.equal(json.data.item.id, WHAT_IS_TREESITE_ID);
  assert.equal(json.data.item.slug, "what-is-treesite");
});

test("get_node returns ITEM_NOT_FOUND for unknown id", () => {
  const { json, status } = runTool("get-node", exampleArtifact, { id: UNKNOWN_ID });
  assert.equal(status, 3);
  assert.equal(json.ok, false);
  assert.equal(json.error.code, "ITEM_NOT_FOUND");
});

test("get_children of root returns section items", () => {
  const { json, status } = runTool("get-children", exampleArtifact, {});
  assert.equal(status, 0);
  assert.ok(json.data.children.length >= 3);
  assert.ok(json.data.children.every(c => c.type === "section"));
});

test("get_children of section returns leaf items", () => {
  const { json, status } = runTool("get-children", exampleArtifact, { id: SEC_ABOUT_ID });
  assert.equal(status, 0);
  assert.ok(json.data.children.length >= 2);
  assert.ok(json.data.children.every(c => c.type === "text"));
});

test("search finds name matches", () => {
  const { json, status } = runTool("search", exampleArtifact, { query: "TreeSite", limit: 10 });
  assert.equal(status, 0);
  assert.ok(json.data.results.length > 0);
});

test("search returns empty for no match", () => {
  const { json, status } = runTool("search", exampleArtifact, {
    query: "zzznomatchzzzz",
    limit: 5
  });
  assert.equal(status, 0);
  assert.equal(json.data.results.length, 0);
});

test("inspect_subtree returns nested structure", () => {
  const { json, status } = runTool("inspect-subtree", exampleArtifact, {
    id: SEC_ABOUT_ID,
    maxDepth: 2
  });
  assert.equal(status, 0);
  assert.equal(json.data.subtree.id, SEC_ABOUT_ID);
  assert.ok(Array.isArray(json.data.subtree.children));
});

test("artifact_stats returns example counts", () => {
  const { json, status } = runTool("artifact-stats", exampleArtifact);
  assert.equal(status, 0);
  assert.equal(json.data.schemaVersion, 1);
  assert.equal(json.data.itemCount, 12);
});

test("get_manifest matches manifest.json file", async () => {
  const raw = await fs.readFile(path.join(exampleArtifact, "manifest.json"), "utf8");
  const fileManifest = JSON.parse(raw);
  const { json, status } = runTool("get-manifest", exampleArtifact);
  assert.equal(status, 0);
  assert.deepEqual(json.data.manifest, fileManifest);
});

test("validate passes on example artifact", () => {
  const { json, status } = runTool("validate", exampleArtifact);
  assert.equal(status, 0);
  assert.equal(json.data.valid, true);
});

test("migrate runs zero steps on v1 artifact", () => {
  const { json, status } = runTool("migrate", exampleArtifact);
  assert.equal(status, 0);
  assert.deepEqual(json.data.stepsRun, []);
});

test("add_card assigns uuid id", async () => {
  const tmp = await copyArtifactToTemp();
  const { json, status } = runTool("add-card", tmp, {
    name: "Test Card",
    section: "About This Site",
    type: "text"
  });
  assert.equal(status, 0);
  assert.match(json.data.id, /^[0-9a-f-]{36}$/i);
  assert.equal(json.data.manifestRebuilt, true);
});

test("rename_card preserves id", async () => {
  const tmp = await copyArtifactToTemp();
  const add = runTool("add-card", tmp, {
    name: "Rename Me",
    section: "About This Site",
    type: "text",
    slug: "rename-me-test"
  });
  const id = add.json.data.id;
  const ren = runTool("rename-card", tmp, {
    id,
    name: "Renamed Card",
    slug: "renamed-card-test"
  });
  assert.equal(ren.status, 0);
  assert.equal(ren.json.data.id, id);
  const got = runTool("get-node", tmp, { id });
  assert.equal(got.json.data.item.name, "Renamed Card");
});

test("move_card preserves id and updates section", async () => {
  const tmp = await copyArtifactToTemp();
  const add = runTool("add-card", tmp, {
    name: "Move Me",
    section: "About This Site",
    type: "text"
  });
  const id = add.json.data.id;
  const moved = runTool("move-card", tmp, { id, section: "Content Types" });
  assert.equal(moved.status, 0);
  assert.equal(moved.json.data.id, id);
  const got = runTool("get-node", tmp, { id });
  assert.equal(got.json.data.item.section, "Content Types");
});

test("edit_card preserves id", async () => {
  const tmp = await copyArtifactToTemp();
  const add = runTool("add-card", tmp, {
    name: "Edit Me",
    section: "About This Site",
    type: "text"
  });
  const id = add.json.data.id;
  const edited = runTool("edit-card", tmp, {
    id,
    fields: { description: "Edited description" }
  });
  assert.equal(edited.status, 0);
  const got = runTool("get-node", tmp, { id });
  assert.equal(got.json.data.item.description, "Edited description");
});

test("edit_card rejects id change", async () => {
  const tmp = await copyArtifactToTemp();
  const add = runTool("add-card", tmp, {
    name: "Id Lock",
    section: "About This Site",
    type: "text"
  });
  const id = add.json.data.id;
  const bad = runTool("edit-card", tmp, {
    id,
    fields: { id: UNKNOWN_ID }
  });
  assert.equal(bad.status, 1);
  assert.equal(bad.json.error.code, "INVALID_INPUT");
});

test("delete_card removes item from manifest", async () => {
  const tmp = await copyArtifactToTemp();
  const add = runTool("add-card", tmp, {
    name: "Delete Me",
    section: "About This Site",
    type: "text"
  });
  const id = add.json.data.id;
  const del = runTool("delete-card", tmp, { id, confirm: true });
  assert.equal(del.status, 0);
  const missing = runTool("get-node", tmp, { id });
  assert.equal(missing.status, 3);
});

test("manifest matches rebuild after mutation", async () => {
  const tmp = await copyArtifactToTemp();
  runTool("add-card", tmp, { name: "Manifest Check", section: "About This Site", type: "text" });
  const rebuilt = runTool("rebuild-manifest", tmp);
  assert.equal(rebuilt.status, 0);
  const manifest = runTool("get-manifest", tmp);
  const raw = await fs.readFile(path.join(tmp, "manifest.json"), "utf8");
  assert.deepEqual(manifest.json.data.manifest, JSON.parse(raw));
});

test("validate detects manifest drift", async () => {
  const tmp = await copyArtifactToTemp();
  const manifestPath = path.join(tmp, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.children[0].name = "Drifted Name";
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = runTool("validate", tmp);
  assert.equal(result.status, 2);
  assert.equal(result.json.error.code, "MANIFEST_DRIFT");
});

test("rebuild_manifest fixes drift", async () => {
  const tmp = await copyArtifactToTemp();
  const manifestPath = path.join(tmp, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.children[0].name = "Drifted Name";
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  runTool("rebuild-manifest", tmp);
  const result = runTool("validate", tmp);
  assert.equal(result.status, 0);
  assert.equal(result.json.data.valid, true);
});

test("validate fails DUPLICATE_ID after manual duplicate", async () => {
  const tmp = await copyArtifactToTemp();
  const itemsDir = path.join(tmp, "items");
  const source = JSON.parse(await fs.readFile(path.join(itemsDir, "what-is-treesite.json"), "utf8"));
  source.slug = "duplicate-id-copy";
  await fs.writeFile(path.join(itemsDir, "duplicate-id-copy.json"), `${JSON.stringify(source, null, 2)}\n`);
  const result = runTool("validate", tmp);
  assert.equal(result.status, 0);
  assert.equal(result.json.data.valid, false);
  assert.ok(
    result.json.data.errors.some(e => e.code === "DUPLICATE_ID")
  );
});
