/**
 * On-disk config fallback so a global install works from any directory without
 * exporting env vars. Resolution order elsewhere: env var -> cwd .env -> this file.
 * The file holds a secret, so it is written with 0600 (dir 0700).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface LinearAxiConfig {
  apiKey?: string;
  defaultTeam?: string;
}

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "linear-axi");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function readConfig(): LinearAxiConfig {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8")) as LinearAxiConfig;
  } catch {
    return {};
  }
}

export function writeConfig(patch: Partial<LinearAxiConfig>): LinearAxiConfig {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const next: LinearAxiConfig = { ...readConfig(), ...patch };
  const file = configPath();
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(file, 0o600); // enforce perms even if the file pre-existed
  return next;
}

export function clearConfig(): boolean {
  const file = configPath();
  if (!fs.existsSync(file)) return false;
  fs.rmSync(file);
  return true;
}
