/**
 * `linear-axi setup hooks` - AXI principle #7 (ambient context via session hooks).
 *
 * Registers a SessionStart hook so each agent session begins with the linear-axi
 * home view (your open issues) already in context - no invocation needed.
 *
 * - Explicit opt-in: only ever runs from this command, never from normal usage.
 * - Idempotent + self-repairing: re-running updates the executable path in place.
 * - Multi-agent by default: Claude Code, Codex, and OpenCode.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type FlagSchema } from "../lib/args.js";
import { usageError } from "../lib/errors.js";
import { print, printLine } from "../output/toon.js";

const SCHEMA: FlagSchema = {
  agent: { type: "string", description: "claude | codex | opencode | all (default: all)" },
  uninstall: { type: "boolean", description: "remove the hook instead of installing it" },
};

const HELP = `linear-axi setup hooks - install a session-start hook for ambient context

Registers a hook so each agent session starts with your open Linear issues in
context. Opt-in, idempotent, and self-repairing (updates the path on re-run).

Flags:
  --agent <a>    claude | codex | opencode | all   (default: all installed)
  --uninstall    remove the hook instead of installing

Examples:
  linear-axi setup hooks
  linear-axi setup hooks --agent claude
  linear-axi setup hooks --uninstall`;

type Action = "installed" | "updated" | "unchanged" | "removed" | "skipped";
interface Outcome {
  agent: string;
  path: string;
  action: Action;
}

/** The command a hook runs: this exact linear-axi build, via the current node. */
function hookCommand(): string {
  const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "index.js");
  return `${process.execPath} ${entry}`;
}

const MARKER = "linear-axi";

export async function setupHooks(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "setup hooks");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const agent = ((parsed.flags.agent as string) ?? "all").toLowerCase();
  const valid = ["claude", "codex", "opencode", "all"];
  if (!valid.includes(agent)) {
    throw usageError(`unknown agent "${agent}"`, ["valid: claude, codex, opencode, all"]);
  }
  const uninstall = parsed.flags.uninstall === true;
  const command = hookCommand();

  const outcomes: Outcome[] = [];
  if (agent === "claude" || agent === "all") outcomes.push(claudeHook(command, uninstall));
  if (agent === "codex" || agent === "all") outcomes.push(codexHook(command, uninstall));
  if (agent === "opencode" || agent === "all") outcomes.push(openCodeHook(command, uninstall));

  print(
    { hooks: outcomes.map((o) => ({ agent: o.agent, action: o.action, path: collapse(o.path) })) },
    [
      uninstall
        ? "Removed the linear-axi session hook where present."
        : "Start a new agent session; your open issues load automatically.",
    ],
  );
  return 0;
}

// ---- Claude Code: ~/.claude/settings.json, hooks.SessionStart ----

function claudeHook(command: string, uninstall: boolean): Outcome {
  const file = path.join(os.homedir(), ".claude", "settings.json");
  const settings = readJson(file);
  settings.hooks ??= {};
  const list: any[] = Array.isArray(settings.hooks.SessionStart) ? settings.hooks.SessionStart : [];

  const kept = list.filter((entry) => !entryMatches(entry));
  const changed = kept.length !== list.length;

  if (uninstall) {
    if (!changed) return { agent: "claude", path: file, action: "unchanged" };
    settings.hooks.SessionStart = kept;
    writeJson(file, settings);
    return { agent: "claude", path: file, action: "removed" };
  }

  kept.push({ hooks: [{ type: "command", command }] });
  settings.hooks.SessionStart = kept;
  writeJson(file, settings);
  return { agent: "claude", path: file, action: changed ? "updated" : "installed" };
}

function entryMatches(entry: any): boolean {
  const cmds = Array.isArray(entry?.hooks) ? entry.hooks : [];
  return cmds.some((h: any) => typeof h?.command === "string" && h.command.includes(MARKER));
}

// ---- Codex: ~/.codex/hooks.json + [features].hooks = true in config.toml ----

function codexHook(command: string, uninstall: boolean): Outcome {
  const file = path.join(os.homedir(), ".codex", "hooks.json");
  const cfg = readJson(file);
  const list: any[] = Array.isArray(cfg.SessionStart) ? cfg.SessionStart : [];
  const kept = list.filter((h) => !(typeof h?.command === "string" && h.command.includes(MARKER)));
  const changed = kept.length !== list.length;

  if (uninstall) {
    if (!changed) return { agent: "codex", path: file, action: "unchanged" };
    cfg.SessionStart = kept;
    writeJson(file, cfg);
    return { agent: "codex", path: file, action: "removed" };
  }

  kept.push({ command });
  cfg.SessionStart = kept;
  writeJson(file, cfg);
  ensureCodexFeature();
  return { agent: "codex", path: file, action: changed ? "updated" : "installed" };
}

/** Best-effort: enable `[features] hooks = true` in ~/.codex/config.toml. */
function ensureCodexFeature(): void {
  const file = path.join(os.homedir(), ".codex", "config.toml");
  let toml = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (/^\s*hooks\s*=\s*true/m.test(toml)) return;
  if (/^\[features\]/m.test(toml)) {
    toml = toml.replace(/^\[features\]/m, "[features]\nhooks = true");
  } else {
    toml += `${toml.endsWith("\n") || toml === "" ? "" : "\n"}[features]\nhooks = true\n`;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toml);
}

// ---- OpenCode: ~/.config/opencode/plugins/linear-axi.js ----

function openCodeHook(command: string, uninstall: boolean): Outcome {
  const dir = path.join(os.homedir(), ".config", "opencode", "plugins");
  const file = path.join(dir, "linear-axi-context.js");

  if (uninstall) {
    if (!fs.existsSync(file)) return { agent: "opencode", path: file, action: "unchanged" };
    fs.rmSync(file);
    return { agent: "opencode", path: file, action: "removed" };
  }

  const existed = fs.existsSync(file);
  const plugin = openCodePlugin(command);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, plugin);
  return { agent: "opencode", path: file, action: existed ? "updated" : "installed" };
}

function openCodePlugin(command: string): string {
  // Injects the linear-axi home view as system context at session start.
  return `// Generated by \`linear-axi setup hooks\` (${MARKER}). Safe to delete.
import { execSync } from "node:child_process";

export const LinearAxiContext = async () => ({
  "session.start": async (_input, output) => {
    try {
      const text = execSync(${JSON.stringify(command)}, { encoding: "utf8", timeout: 15000 });
      output.context = (output.context ?? "") + "\\n\\n# Linear (linear-axi)\\n" + text;
    } catch {
      /* linear-axi unavailable or not authed; skip ambient context */
    }
  },
});
`;
}

// ---- helpers ----

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function collapse(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? p.replace(home, "~") : p;
}
