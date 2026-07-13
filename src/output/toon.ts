/**
 * Output boundary for AXI principle #1 (token-efficient TOON output).
 * Internal logic stays on plain JS objects; we convert to TOON only here.
 */
import { encode } from "@toon-format/toon";
import type { AxiError } from "../lib/errors.js";

/** A help entry: a complete, actionable next-step command (principle #9). */
export type Help = string[];

/**
 * Render a plain object/array to a TOON string.
 * Key order is preserved, so callers control the visual layout.
 */
export function toon(value: unknown): string {
  return encode(value, { delimiter: "," });
}

/**
 * Render a help[] block manually (principle #9). We do not let TOON inline it
 * as a comma-joined array because help lines can contain commas, and AXI's
 * canonical layout is one command per line.
 */
export function renderHelp(help: Help): string {
  if (help.length === 0) return "";
  return `help[${help.length}]:\n` + help.map((h) => "  " + h).join("\n");
}

/**
 * Print a structured body (TOON-encoded) followed by an optional help block.
 * This is the primary output path for list/detail/mutation responses.
 */
export function print(body: unknown, help?: Help): void {
  let out = toon(body);
  if (help && help.length > 0) out += "\n" + renderHelp(help);
  process.stdout.write(out + "\n");
}

/**
 * Print a plain text line (e.g. a definitive empty state, principle #5)
 * plus an optional help block, without TOON quoting.
 */
export function printLine(text: string, help?: Help): void {
  let out = text;
  if (help && help.length > 0) out += "\n" + renderHelp(help);
  process.stdout.write(out + "\n");
}

/** Print a raw pre-formatted block (used for --full bodies). */
export function printRaw(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

/**
 * Print a structured error to stdout (principle #6) and return its exit code.
 * Never throws; callers do `process.exit(printError(e))`.
 */
export function printError(err: AxiError | Error): number {
  const isAxi = "exitCode" in err && typeof (err as AxiError).exitCode === "number";
  const help = isAxi ? (err as AxiError).help : [];
  let out = toon({ error: err.message });
  if (help.length > 0) out += "\n" + renderHelp(help);
  process.stdout.write(out + "\n");
  return isAxi ? (err as AxiError).exitCode : 1;
}
