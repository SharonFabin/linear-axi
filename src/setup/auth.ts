/**
 * `linear-axi setup auth` - save credentials to the config file so a global
 * install works from any directory without exporting env vars.
 * Flag-based only, no interactive prompts (principle #6). Never prints the key.
 */
import { parseArgs, type FlagSchema } from "../lib/args.js";
import { usageError } from "../lib/errors.js";
import { print, printLine } from "../output/toon.js";
import { readConfig, writeConfig, clearConfig, configPath } from "../lib/config.js";
import os from "node:os";

const SCHEMA: FlagSchema = {
  key: { type: "string", description: "Linear personal API key to save" },
  team: { type: "string", description: "default team key or name to save" },
  clear: { type: "boolean", description: "remove the saved config file" },
};

const HELP = `linear-axi setup auth - save your Linear API key to the config file

The key is written to ~/.config/linear-axi/config.json with 0600 permissions,
so a global install works from any directory. Resolution order is:
env LINEAR_API_KEY -> a .env in the current directory -> this config file.

Flags:
  --key <lin_api_...>   save the API key
  --team <key/name>     save a default team (used when --team is omitted)
  --clear               delete the saved config file

Examples:
  linear-axi setup auth --key lin_api_xxx --team ENG
  linear-axi setup auth                 # show current auth status (key redacted)
  linear-axi setup auth --clear`;

export async function setupAuth(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "setup auth");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  if (parsed.flags.clear === true) {
    const removed = clearConfig();
    printLine(removed ? `auth: removed ${collapse(configPath())}` : "auth: no saved config to remove");
    return 0;
  }

  const key = typeof parsed.flags.key === "string" ? parsed.flags.key : undefined;
  const team = typeof parsed.flags.team === "string" ? parsed.flags.team : undefined;

  // No mutating flags -> show current status (content first).
  if (key === undefined && team === undefined) {
    return showStatus();
  }

  if (key !== undefined && !key.startsWith("lin_api_")) {
    throw usageError("that does not look like a Linear API key", [
      "keys start with lin_api_ - get one at Linear -> Settings -> Security & access",
    ]);
  }

  writeConfig({
    ...(key !== undefined ? { apiKey: key } : {}),
    ...(team !== undefined ? { defaultTeam: team } : {}),
  });

  const saved: Record<string, string> = {};
  if (key !== undefined) saved.apiKey = redact(key);
  if (team !== undefined) saved.defaultTeam = team;
  saved.path = collapse(configPath());

  print({ saved }, ["Run `linear-axi` to verify it works from any directory"]);
  return 0;
}

function showStatus(): number {
  const cfg = readConfig();
  const envKey = process.env.LINEAR_API_KEY;
  const source = envKey ? "env LINEAR_API_KEY" : cfg.apiKey ? "config file" : "none";
  const key = envKey ?? cfg.apiKey;

  print({
    auth: {
      apiKey: key ? redact(key) : "not set",
      source,
      defaultTeam: process.env.LINEAR_AXI_DEFAULT_TEAM ?? cfg.defaultTeam ?? "not set",
      configPath: collapse(configPath()),
    },
  }, key ? undefined : ["Run `linear-axi setup auth --key lin_api_...` to save a key"]);
  return 0;
}

function redact(key: string): string {
  if (key.length <= 12) return "lin_api_****";
  return key.slice(0, 12) + "..." + key.slice(-4);
}

function collapse(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? p.replace(home, "~") : p;
}
