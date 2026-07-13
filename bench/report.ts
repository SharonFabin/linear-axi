/** Aggregate benchmark results into a comparison table (console + report.md). */
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "./config.js";

interface Result {
  condition: string;
  task: string;
  pass: boolean;
  costUsd: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

interface Agg {
  condition: string;
  runs: number;
  successPct: number;
  avgCost: number;
  avgTurns: number;
  avgInputTokens: number;
  avgDurationS: number;
}

export function aggregate(results: Result[]): Agg[] {
  const byCond = new Map<string, Result[]>();
  for (const r of results) {
    if (!byCond.has(r.condition)) byCond.set(r.condition, []);
    byCond.get(r.condition)!.push(r);
  }
  const aggs: Agg[] = [];
  for (const [condition, rs] of byCond) {
    const n = rs.length;
    aggs.push({
      condition,
      runs: n,
      successPct: (100 * rs.filter((r) => r.pass).length) / n,
      avgCost: mean(rs.map((r) => r.costUsd)),
      avgTurns: mean(rs.map((r) => r.turns)),
      avgInputTokens: mean(rs.map((r) => r.inputTokens)),
      avgDurationS: mean(rs.map((r) => r.durationMs)) / 1000,
    });
  }
  // linear-axi first, then by cost ascending.
  return aggs.sort((a, b) =>
    a.condition === "linear-axi" ? -1 : b.condition === "linear-axi" ? 1 : a.avgCost - b.avgCost,
  );
}

export function writeReport(results: Result[]): void {
  const aggs = aggregate(results);
  const lines: string[] = [];
  lines.push("# linear-axi benchmark results\n");
  lines.push(`Runs: ${results.length} - tasks: ${new Set(results.map((r) => r.task)).size} - generated ${new Date().toISOString()}\n`);
  lines.push("| Condition | Runs | Success | Avg cost | Avg turns | Avg input tokens | Avg time |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const a of aggs) {
    lines.push(
      `| ${a.condition} | ${a.runs} | ${a.successPct.toFixed(0)}% | $${a.avgCost.toFixed(4)} | ${a.avgTurns.toFixed(1)} | ${Math.round(a.avgInputTokens).toLocaleString()} | ${a.avgDurationS.toFixed(1)}s |`,
    );
  }

  const axi = aggs.find((a) => a.condition === "linear-axi");
  const mcp = aggs.find((a) => a.condition === "linear-mcp");
  if (axi && mcp) {
    lines.push("\n## linear-axi vs Linear MCP\n");
    lines.push(`- Cost: ${pctDelta(axi.avgCost, mcp.avgCost)} (${fmtUsd(axi.avgCost)} vs ${fmtUsd(mcp.avgCost)})`);
    lines.push(`- Turns: ${pctDelta(axi.avgTurns, mcp.avgTurns)} (${axi.avgTurns.toFixed(1)} vs ${mcp.avgTurns.toFixed(1)})`);
    lines.push(`- Input tokens: ${pctDelta(axi.avgInputTokens, mcp.avgInputTokens)} (${Math.round(axi.avgInputTokens).toLocaleString()} vs ${Math.round(mcp.avgInputTokens).toLocaleString()})`);
    lines.push(`- Success: ${axi.successPct.toFixed(0)}% vs ${mcp.successPct.toFixed(0)}%`);
  }

  const md = lines.join("\n") + "\n";
  const out = path.resolve(CONFIG.resultsDir, "report.md");
  fs.writeFileSync(out, md);
  process.stdout.write("\n" + md + `\nWritten to ${out}\n`);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
function pctDelta(axi: number, other: number): string {
  if (other === 0) return "n/a";
  const d = (100 * (axi - other)) / other;
  return d <= 0 ? `${d.toFixed(0)}% (cheaper/fewer)` : `+${d.toFixed(0)}% (more)`;
}

// Allow `npx tsx bench/report.ts` to re-render from the saved jsonl.
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = path.resolve(CONFIG.resultsDir, "results.jsonl");
  const results = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Result);
  writeReport(results);
}
