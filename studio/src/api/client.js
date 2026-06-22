const BASE = "/api";

export async function listArtifacts() {
  const res = await fetch(`${BASE}/artifacts`);
  if (!res.ok) throw new Error(`listArtifacts: HTTP ${res.status}`);
  return res.json();
}

export async function createProject({ name, displayName, tagline }) {
  const res = await fetch(`${BASE}/artifacts/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, displayName, tagline }),
  });
  if (!res.ok) throw new Error(`createProject: HTTP ${res.status}`);
  return res.json();
}

export async function listFiles(name) {
  const res = await fetch(`${BASE}/artifacts/${encodeURIComponent(name)}/files`);
  if (!res.ok) throw new Error(`listFiles: HTTP ${res.status}`);
  return res.json();
}

export async function listItems(name) {
  const res = await fetch(`${BASE}/artifacts/${encodeURIComponent(name)}/items`);
  if (!res.ok) throw new Error(`listItems: HTTP ${res.status}`);
  return res.json();
}

export async function runTool(artifactName, tool, input = {}) {
  const res = await fetch(`${BASE}/tool/${encodeURIComponent(tool)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactName, input }),
  });
  if (!res.ok) throw new Error(`runTool(${tool}): HTTP ${res.status}`);
  return res.json();
}

export async function getManifest(artifactName) {
  const result = await runTool(artifactName, "get-manifest", {});
  if (!result.ok) throw new Error(result.error?.message || "get-manifest failed");
  return result.data.manifest;
}

export async function getNode(artifactName, id) {
  const result = await runTool(artifactName, "get-node", { id });
  if (!result.ok) throw new Error(result.error?.message || "get-node failed");
  return result.data.item;
}

export async function getStats(artifactName) {
  const result = await runTool(artifactName, "artifact-stats", {});
  if (!result.ok) throw new Error(result.error?.message || "artifact-stats failed");
  return result.data;
}

export async function validate(artifactName) {
  return runTool(artifactName, "validate", { strict: false });
}

export async function exportZip(artifactName, destZip) {
  return runTool(artifactName, "export-zip", { destZip });
}

export async function importZip(srcZip, destDir, overwrite = false) {
  const res = await fetch(`${BASE}/tool/import-zip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      artifactName: destDir,
      destDir,
      input: { srcZip, overwrite },
    }),
  });
  if (!res.ok) throw new Error(`importZip: HTTP ${res.status}`);
  return res.json();
}

export function exportDownloadUrl(artifactName) {
  return `${BASE}/artifacts/${encodeURIComponent(artifactName)}/export`;
}

export function buildPreviewUrl(artifactName) {
  const artifactPath = `/artifact/${artifactName}/`;
  return `/preview/?artifact=${encodeURIComponent(artifactPath)}`;
}

export async function openPreview(artifactName) {
  const res = await fetch(`${BASE}/preview/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactName }),
  });
  const data = await res.json();
  if (!res.ok && !data.error) {
    return { ok: false, error: { code: "HTTP_ERROR", message: `openPreview: HTTP ${res.status}` } };
  }
  return data;
}

export async function getPreviewStatus() {
  const res = await fetch(`${BASE}/preview/status`);
  if (!res.ok) throw new Error(`getPreviewStatus: HTTP ${res.status}`);
  return res.json();
}

export async function revealArtifact(artifactName) {
  const res = await fetch(`${BASE}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ artifactName }),
  });
  if (!res.ok) throw new Error(`revealArtifact: HTTP ${res.status}`);
  return res.json();
}

export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error?.message || `upload: HTTP ${res.status}`);
  return data.data;
}

async function runMutatingTool(artifactName, tool, input) {
  const result = await runTool(artifactName, tool, input);
  if (!result.ok) throw new Error(result.error?.message || `${tool} failed`);
  return result.data;
}

export function editCard(artifactName, id, fields) {
  return runMutatingTool(artifactName, "edit-card", { id, fields });
}

export function addCard(artifactName, payload) {
  return runMutatingTool(artifactName, "add-card", payload);
}

export function renameCard(artifactName, payload) {
  return runMutatingTool(artifactName, "rename-card", payload);
}

export function moveCard(artifactName, { id, section }) {
  return runMutatingTool(artifactName, "move-card", { id, section });
}

export function moveSubtree(artifactName, { id, newSection }) {
  return runMutatingTool(artifactName, "move-subtree", {
    id,
    section: newSection,
  });
}

export function hideCard(artifactName, id) {
  return runMutatingTool(artifactName, "hide-card", { id });
}

export function unhideCard(artifactName, id) {
  return runMutatingTool(artifactName, "unhide-card", { id });
}

export function deleteCard(artifactName, id) {
  return runMutatingTool(artifactName, "delete-card", { id, confirm: true });
}

// ── Asset intakes ──────────────────────────────────────────────────────────

export async function addPdf(artifactName, { name, section, description, value }, file) {
  const form = new FormData();
  form.append("artifactName", artifactName);
  form.append("fields", JSON.stringify({ name, section, description, value }));
  form.append("file", file);
  const res = await fetch(`${BASE}/intake/add-pdf`, { method: "POST", body: form });
  return res.json();
}

export async function addWebsite(artifactName, { name, section, url, skipPreview = false }) {
  return runTool(artifactName, "add-website", { name, section, url, skipPreview });
}

export async function addHtml(artifactName, { name, section, skipPreview = false }, file) {
  const form = new FormData();
  form.append("artifactName", artifactName);
  form.append("fields", JSON.stringify({ name, section, skipPreview }));
  if (file) form.append("file", file);
  const res = await fetch(`${BASE}/intake/add-html`, { method: "POST", body: form });
  return res.json();
}
