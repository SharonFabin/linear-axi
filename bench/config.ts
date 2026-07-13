/** Shared benchmark configuration. */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

loadEnv({ path: path.resolve(rootDir(), ".env") });

export function rootDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export const CONFIG = {
  /** Model the benchmarked agent runs on. */
  agentModel: process.env.BENCH_MODEL ?? "claude-sonnet-5",
  /** Cheaper model for the LLM judge. */
  judgeModel: process.env.BENCH_JUDGE_MODEL ?? "claude-haiku-4-5-20251001",
  /** Safe team the benchmark reads from and writes to. */
  teamKey: process.env.LINEAR_AXI_DEFAULT_TEAM ?? "testaxi",
  apiKey: requireEnv("LINEAR_API_KEY"),
  /** Repeats per (condition, task). Keep low while iterating. */
  repeats: Number.parseInt(process.env.BENCH_REPEATS ?? "3", 10),
  /** Absolute path to the built linear-axi entry, used by the linear-axi condition. */
  linearAxiEntry: path.resolve(rootDir(), "dist/index.js"),
  resultsDir: path.resolve(rootDir(), "bench/results"),
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (set it in .env)`);
  return v;
}
