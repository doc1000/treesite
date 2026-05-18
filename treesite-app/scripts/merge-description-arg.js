import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DESCRIPTION_FILE_KEY = "description-file";

/**
 * Reads UTF-8 from --description-file into args.description.
 * Mutually exclusive with a string --description.
 *
 * @param {Record<string, unknown>} args
 */
export async function mergeDescriptionArgs(args) {
  const fileRaw = args[DESCRIPTION_FILE_KEY];
  const descRaw = args.description;

  if (fileRaw === true || (typeof fileRaw === "string" && fileRaw.trim() === "")) {
    throw new Error("--description-file requires a non-empty path.");
  }

  if (fileRaw !== undefined && typeof fileRaw !== "string") {
    throw new Error("--description-file requires a path string.");
  }

  const filePath =
    typeof fileRaw === "string" && fileRaw.trim() !== ""
      ? path.resolve(process.cwd(), fileRaw.trim())
      : null;

  const hasInlineDescription =
    descRaw !== undefined && descRaw !== true && typeof descRaw === "string";

  if (filePath && hasInlineDescription) {
    throw new Error("Use only one of: --description, --description-file.");
  }

  if (!filePath) {
    return;
  }

  await fs.access(filePath);
  const st = await fs.stat(filePath);
  if (!st.isFile()) {
    throw new Error("--description-file must point to a regular file.");
  }

  let text = await fs.readFile(filePath, "utf8");
  text = text.replace(/\r\n/g, "\n");
  args.description = text;
}
