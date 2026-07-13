/**
 * Minimal flag parser enforcing AXI principle #6:
 * - unknown flags are rejected by name, with the valid set listed inline
 * - --help always passes
 * - no interactive prompts; everything comes from flags
 */
import { usageError } from "./errors.js";

export interface FlagSpec {
  type: "string" | "boolean";
  description: string;
  /** Alternate spellings (e.g. { "-s": "state" }) handled by the caller's map. */
}

export type FlagSchema = Record<string, FlagSpec>;

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
  help: boolean;
}

/**
 * Parse argv (already stripped of the command path) against a schema.
 * `commandLabel` is used in error messages, e.g. "issue list".
 */
export function parseArgs(argv: string[], schema: FlagSchema, commandLabel: string): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let help = false;

  const valid = Object.keys(schema);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    // --name or --name=value
    const eq = arg.indexOf("=");
    const name = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const inlineValue = eq >= 0 ? arg.slice(eq + 1) : undefined;

    const spec = schema[name];
    if (!spec) {
      throw usageError(`unknown flag --${name} for \`${commandLabel}\``, [
        `valid flags for \`${commandLabel}\`: ${valid.map((f) => "--" + f).join(", ")} (--help always allowed)`,
      ]);
    }

    if (spec.type === "boolean") {
      flags[name] = inlineValue === undefined ? true : inlineValue !== "false";
      continue;
    }

    // string flag needs a value
    if (inlineValue !== undefined) {
      flags[name] = inlineValue;
    } else {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith("--") && next.length > 2)) {
        throw usageError(`flag --${name} requires a value`, [
          `${commandLabel} --${name} <value>`,
        ]);
      }
      flags[name] = next;
      i++;
    }
  }

  return { positionals, flags, help };
}

/** Read a string flag or throw a usage error if required and missing. */
export function requireString(
  parsed: ParsedArgs,
  name: string,
  commandLabel: string,
  example: string,
): string {
  const v = parsed.flags[name];
  if (typeof v !== "string" || v.length === 0) {
    throw usageError(`--${name} is required`, [example]);
  }
  return v;
}
