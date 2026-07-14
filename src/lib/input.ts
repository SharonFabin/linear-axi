/**
 * Resolve a text body that may come from a flag or a file. Long, structured
 * bodies (descriptions, comments) are painful to pass safely through the shell;
 * a `--*-file` companion flag avoids escaping pitfalls entirely. A path of "-"
 * reads stdin. Passing both the inline flag and the file flag is a usage error.
 */
import { readFileSync } from "node:fs";
import { usageError } from "./errors.js";

export function resolveBody(
  value: string | undefined,
  filePath: string | undefined,
  label: string,
): string | undefined {
  if (value !== undefined && filePath !== undefined) {
    throw usageError(`pass either --${label} or --${label}-file, not both`, [
      `linear-axi ... --${label} "..."   or   --${label}-file <path>`,
    ]);
  }
  if (filePath === undefined) return value;

  try {
    // fd 0 = stdin when the path is "-".
    return filePath === "-" ? readFileSync(0, "utf8") : readFileSync(filePath, "utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw usageError(`could not read --${label}-file "${filePath}": ${msg}`, [
      `Check the path, or pipe the body in with \`--${label}-file -\``,
    ]);
  }
}
