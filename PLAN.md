# linear-axi - design & status

An agent-ergonomic CLI for Linear built to the [AXI](https://axi.md) standard.
Goal: fewer tokens and turns than the official Linear MCP at equal success.

## Architecture

- **Language:** TypeScript / Node 20+.
- **Backend:** the official `@linear/sdk` over raw GraphQL (Linear has no good
  official CLI). Raw queries fetch exactly the needed fields in one request,
  avoiding N+1 round-trips.
- **Output:** JSON internally, [TOON](https://toonformat.dev/) only at the stdout
  boundary (`src/output/toon.ts`).
- **Auth:** `LINEAR_API_KEY` (personal API key). No interactive prompts.
- **Layout:** `src/index.ts` (routing + home view), `src/commands/issue/*`,
  `src/linear/*` (client + resolvers), `src/lib/*` (args, errors, context,
  truncate), `src/setup/hooks.ts`, `skills/linear-axi/SKILL.md`, `bench/`.

## AXI principles coverage

All 10 principles are implemented: TOON output, minimal default schemas (3-4
fields), description truncation with `--full`, pre-computed aggregates, definitive
empty states, structured errors with exit codes 0/1/2, ambient-context session
hooks (`setup hooks`), content-first home view, contextual next-step `help[]`,
and consistent per-command `--help`.

## Command surface

`home`, `issue list|view|create|update|comment`, `setup hooks`. Mutations are
idempotent (no-op with exit 0 when the desired state already holds). Combined
operations (`update --comment`, `create --comment`) cut multi-step workflows by a
turn.

## Status

- **Read path** - done: home, `issue list` (filters, aggregate, empty states,
  lenient default team), `issue view` (truncation + derived counts).
- **Write path** - done: `issue create`, idempotent `issue update`, `issue
  comment` (add + list). Resolvers for state, assignee, labels, priority.
- **Distribution** - done: generated-quality `SKILL.md`, `setup hooks` for Claude
  Code / Codex / OpenCode, README, MIT license, publishable `package.json`.
- **Benchmark** - done: `bench/` harness (4 conditions, 10 tasks, programmatic
  verification). Results below.
- Unit tests green (`npm test`); typecheck clean.

## Benchmark results (10 tasks x 4 conditions x 1 repeat = 40 runs, Sonnet)

| Interface | Success | Avg cost | Avg turns | Avg input tokens | Avg time |
|---|---:|---:|---:|---:|---:|
| **linear-axi** | 100% | **$0.0583** | **3.7** | 90,295 | **9.7s** |
| raw-graphql | 100% | $0.0646 | 3.7 | 88,262 | 12.0s |
| linear-mcp | 100% | $0.1212 | 5.5 | 144,860 | 14.5s |
| schpet-cli | 80% | $0.1936 | 10.6 | 322,701 | 41.8s |

**vs Linear MCP: -52% cost, -33% turns, -38% input tokens, at 100% vs 100%
success** - stable across simple and hard tasks. linear-axi is Pareto-best.
`schpet-cli` (a human CLI) degrades badly on hard tasks (80% success, 10.6 turns),
which is exactly the case for AXI. For a strong model, `raw-graphql` is near
parity with AXI (Sonnet knows GraphQL); AXI's edge over raw is expected to widen
with a weaker model (Haiku) and in real use (discoverability, session hooks).
Caveat: n=1 per cell is directional; use `BENCH_REPEATS=3-5` for confidence.

## Environment notes

- Reaching `api.linear.app` requires the shell sandbox disabled in this dev setup.
- The benchmark spawns nested `claude` agents; run `npm run bench` from a normal
  terminal (see `bench/README.md`). `npm run bench:check` needs no agent.

## Next / not yet done

- Optional: `--project` / `--cycle` filters and fields, `issue archive`.
- Publication: create the GitHub repo, `npm publish`, then submit a `catalog.yaml`
  community entry to `kunchenguid/axi` via the `no-mistakes` gate (see
  `PUBLISHING.md`).
