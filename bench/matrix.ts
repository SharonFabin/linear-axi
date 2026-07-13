/**
 * Benchmark orchestrator. Runs (condition x task x repeat), seeding a unique
 * fixture per run, executing the agent, and verifying the outcome against Linear.
 *
 * Usage:
 *   npx tsx bench/matrix.ts                         # full matrix
 *   npx tsx bench/matrix.ts --condition linear-axi  # one condition
 *   npx tsx bench/matrix.ts --task read-count-open --repeat 1
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG } from "./config.js";
import { buildConditions, type Condition } from "./conditions.js";
import { TASKS, type Task } from "./tasks.js";
import { runAgent } from "./lib/agent.js";
import { archiveByPrefix } from "./lib/linear.js";
import { writeReport } from "./report.js";

interface Result {
  condition: string;
  task: string;
  kind: string;
  repeat: number;
  pass: boolean;
  detail: string;
  costUsd: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  isError: boolean;
}

async function main() {
  const opts = parseFlags(process.argv.slice(2));
  const conditions = buildConditions().filter((c) => !opts.condition || c.id === opts.condition);
  const tasks = TASKS.filter((t) => !opts.task || t.id === opts.task);
  const repeats = opts.repeat ?? CONFIG.repeats;

  fs.mkdirSync(CONFIG.resultsDir, { recursive: true });
  const resultsFile = path.resolve(CONFIG.resultsDir, "results.jsonl");
  if (opts.fresh) fs.writeFileSync(resultsFile, "");

  log(`Cleaning old BENCH fixtures...`);
  await archiveByPrefix("BENCH ");

  const total = conditions.length * tasks.length * repeats;
  let n = 0;
  const results: Result[] = [];

  for (const task of tasks) {
    for (const condition of conditions) {
      for (let r = 0; r < repeats; r++) {
        n++;
        const tag = shortTag();
        log(`[${n}/${total}] ${condition.id} - ${task.id} - run ${r + 1} (tag ${tag})`);
        const result = await runOne(condition, task, r, tag);
        results.push(result);
        fs.appendFileSync(resultsFile, JSON.stringify(result) + "\n");
        log(`      -> ${result.pass ? "PASS" : "FAIL"} | $${result.costUsd.toFixed(4)} | ${result.turns} turns | ${(result.durationMs / 1000).toFixed(1)}s | ${result.detail}`);
      }
    }
  }

  log(`Cleaning up created BENCH issues...`);
  await archiveByPrefix("BENCH ");

  writeReport(results);
}

async function runOne(condition: Condition, task: Task, repeat: number, tag: string): Promise<Result> {
  const ctx = { tag };
  try {
    if (task.seed) await task.seed(ctx);
    const prompt = task.makePrompt(ctx);
    const m = await runAgent(condition, prompt);
    const verdict = m.isError
      ? { pass: false, detail: `agent error: ${m.answer.slice(0, 120)}` }
      : await task.verify(ctx, m.answer);
    saveRaw(condition.id, task.id, repeat, tag, { prompt, answer: m.answer, verdict, raw: m.raw });
    return {
      condition: condition.id,
      task: task.id,
      kind: task.kind,
      repeat,
      pass: verdict.pass,
      detail: verdict.detail,
      costUsd: m.costUsd,
      turns: m.turns,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      durationMs: m.durationMs,
      isError: m.isError,
    };
  } catch (err) {
    return {
      condition: condition.id,
      task: task.id,
      kind: task.kind,
      repeat,
      pass: false,
      detail: `harness error: ${err instanceof Error ? err.message : String(err)}`,
      costUsd: 0,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      isError: true,
    };
  }
}

function parseFlags(argv: string[]) {
  const opts: { condition?: string; task?: string; repeat?: number; fresh: boolean } = { fresh: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--condition") opts.condition = argv[++i];
    else if (a === "--task") opts.task = argv[++i];
    else if (a === "--repeat") opts.repeat = Number.parseInt(argv[++i] ?? "1", 10);
    else if (a === "--fresh") opts.fresh = true;
  }
  return opts;
}

function saveRaw(
  condition: string,
  task: string,
  repeat: number,
  tag: string,
  data: unknown,
): void {
  const dir = path.resolve(CONFIG.resultsDir, "raw");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.resolve(dir, `${condition}__${task}__r${repeat}__${tag}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const shortTag = () => crypto.randomBytes(3).toString("hex");
const log = (m: string) => process.stderr.write(m + "\n");

main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
