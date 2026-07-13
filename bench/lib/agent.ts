/** Runs one benchmarked agent invocation via the `claude` CLI and extracts metrics. */
import { execFile } from "node:child_process";
import { CONFIG } from "../config.js";
import type { Condition } from "../conditions.js";

export interface RunMetrics {
  costUsd: number;
  turns: number;
  inputTokens: number; // includes cache read + creation (reflects context size)
  outputTokens: number;
  durationMs: number;
  answer: string;
  isError: boolean;
  raw: unknown;
}

export async function runAgent(condition: Condition, prompt: string): Promise<RunMetrics> {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--model",
    CONFIG.agentModel,
    "--dangerously-skip-permissions",
    "--strict-mcp-config",
    "--append-system-prompt",
    condition.systemPrompt,
    ...(condition.mcpConfigPath ? ["--mcp-config", condition.mcpConfigPath] : []),
    ...(condition.disallowedTools.length > 0
      ? ["--disallowedTools", ...condition.disallowedTools]
      : []),
    // allowedTools is variadic - keep it last so its values aren't swallowed.
    "--allowedTools",
    ...condition.allowedTools,
  ];

  const stdout = await exec("claude", args, condition.env);
  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return errorMetrics(stdout);
  }

  // Top-level `usage` (snake_case) is authoritative and includes cache tokens.
  // Total input processed = fresh input + cache reads + cache creation - this is
  // what reflects an interface's context/schema overhead (the AXI headline).
  const usage = parsed.usage ?? {};
  const inputTokens =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);

  return {
    costUsd: parsed.total_cost_usd ?? 0,
    turns: parsed.num_turns ?? 0,
    inputTokens,
    outputTokens: usage.output_tokens ?? 0,
    durationMs: parsed.duration_ms ?? 0,
    answer: typeof parsed.result === "string" ? parsed.result : "",
    isError: parsed.is_error === true,
    raw: parsed,
  };
}

function errorMetrics(stdout: string): RunMetrics {
  return {
    costUsd: 0,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    answer: stdout.slice(0, 500),
    isError: true,
    raw: { parseError: true, stdout: stdout.slice(0, 2000) },
  };
}

function exec(cmd: string, args: string[], env: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        env: { ...process.env, ...env },
        maxBuffer: 20 * 1024 * 1024,
        timeout: 240_000,
      },
      (err, stdout, stderr) => {
        // The result JSON is on stdout even on non-zero exit; prefer it.
        if (stdout && stdout.trim().length > 0) return resolve(stdout);
        resolve(JSON.stringify({ is_error: true, result: String(err ?? stderr) }));
      },
    );
  });
}
