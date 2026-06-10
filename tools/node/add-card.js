import { randomUUID } from "node:crypto";
import { applyCardFields, normalizeCardType } from "./card-fields.js";
import { ErrorCodes } from "./error-codes.js";
import { slugify } from "./content-utils.js";
import {
  fail,
  parseToolArgs,
  rebuildManifest,
  success,
  writeItem
} from "./tool-runner.js";

async function main() {
  const { artifactPath, input } = await parseToolArgs();

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const section = typeof input.section === "string" ? input.section.trim() : "";
  const type = normalizeCardType(
    typeof input.type === "string" ? input.type : "text"
  );

  if (!name) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "name".');
  if (!section) fail(1, ErrorCodes.INVALID_INPUT, 'Input must include non-empty "section".');

  const slug = slugify(
    typeof input.slug === "string" && input.slug.trim() ? input.slug : name
  );
  if (!slug) {
    fail(1, ErrorCodes.INVALID_INPUT, "Could not create a slug from the supplied name.");
  }

  const item = applyCardFields(
    {
      id: randomUUID(),
      name,
      slug,
      section,
      type,
      description:
        typeof input.description === "string" ? input.description : "",
      value: 8
    },
    input
  );

  const written = await writeItem(artifactPath, item);
  await rebuildManifest(artifactPath);

  success({
    id: written.id,
    slug: written.slug,
    manifestRebuilt: true
  });
}

main().catch(err => {
  fail(4, ErrorCodes.FILESYSTEM_ERROR, err?.message || String(err));
});
