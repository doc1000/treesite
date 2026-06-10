import { ErrorCodes } from "./error-codes.js";
import { fail, loadItems, parseToolArgs, success } from "./tool-runner.js";

const DEFAULT_FIELDS = ["name", "description", "html", "slug"];

function excerpt(text, query, maxLen = 120) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const slice = text.slice(start, start + maxLen);
  return start > 0 ? `…${slice}` : slice;
}

async function main() {
  const { artifactPath, input } = await parseToolArgs();
  if (typeof input.query !== "string" || !input.query.trim()) {
    fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "query".');
  }

  const query = input.query.trim();
  const fields = Array.isArray(input.fields)
    ? input.fields.filter(f => typeof f === "string")
    : DEFAULT_FIELDS;
  const limit =
    typeof input.limit === "number" && input.limit > 0 ? Math.floor(input.limit) : 20;

  const items = await loadItems(artifactPath);
  const results = [];

  for (const item of items) {
    if (results.length >= limit) break;
    for (const field of fields) {
      const raw = item[field];
      if (typeof raw !== "string" || !raw) continue;
      if (!raw.toLowerCase().includes(query.toLowerCase())) continue;
      results.push({
        id: item.id,
        name: item.name,
        slug: item.slug,
        matchedField: field,
        excerpt: excerpt(raw, query)
      });
      break;
    }
  }

  success({ results });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});
