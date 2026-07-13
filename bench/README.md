# linear-axi benchmark

Compares how efficiently an AI agent completes real Linear tasks through four
interfaces, to answer: **does linear-axi beat the Linear MCP?**

## Conditions

| id | interface |
|---|---|
| `linear-axi` | our AXI CLI (Bash) |
| `linear-mcp` | Linear MCP server (`@tacticlaunch/mcp-linear`) |
| `raw-graphql` | agent writes GraphQL with `curl` (Bash) |
| `schpet-cli` | `@schpet/linear-cli`, a human-oriented CLI (Bash) |

Each run isolates the agent to exactly one interface (`--strict-mcp-config`,
allow/deny tools) so metrics reflect that interface's ergonomics.

## Tasks

10 tasks (read + write) in `tasks.ts`, each **verified programmatically** against
Linear state (not an LLM judge) for cheap determinism. Every run uses a unique
`tag`; all bench issues are titled `BENCH ...` and archived before and after runs.

The last four are harder on purpose - a multi-step flow (set state + assign +
comment), triage (filter unassigned + iterate), a priority lookup, and creating a
sub-issue - to stress discoverability and composition where AXI should pull ahead
of both MCP and raw GraphQL.

## Metrics

From the `claude` CLI JSON output: success rate, avg cost (USD), avg turns,
avg input tokens (incl. cache - reflects context/schema size), avg wall time.

## How the agent runs

Each run shells out to the `claude` CLI headless:

```
claude -p "<task>" --output-format json --model <sonnet>
  --dangerously-skip-permissions --strict-mcp-config
  --append-system-prompt "<condition prompt>"
  [--mcp-config <linear-mcp.config.json>]
  --disallowedTools ... --allowedTools ...
```

> **Note:** the harness spawns nested `claude` agents. Some managed/sandboxed
> environments block this. Run it from a normal terminal where you can approve
> (or from CI with appropriate permissions).

## Run it

```bash
# 0. one-time
npm install && npm run build

# 1. sanity check (no agent spawn - just Linear connectivity + seed/verify)
npm run bench:check

# 2. smoke: one condition, one task, one repeat
npx tsx bench/matrix.ts --condition linear-axi --task read-count-open --repeat 1 --fresh

# 3. full matrix (4 conditions x 10 tasks x BENCH_REPEATS)
npm run bench

# re-render the table from saved results
npm run bench:report
```

Env knobs (in `.env`): `BENCH_MODEL` (default `claude-sonnet-5`),
`BENCH_REPEATS` (default 3), `BENCH_JUDGE_MODEL`. Results land in
`bench/results/` (gitignored; the MCP config there holds your API token).

## Safety

All writes go to the team in `LINEAR_AXI_DEFAULT_TEAM` (a dedicated test team).
The harness archives every `BENCH ...` issue before and after each run.
