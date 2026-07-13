# linear-axi

An agent-ergonomic CLI for [Linear](https://linear.app), built to the
**[AXI](https://axi.md) (Agent eXperience Interface)** standard. It wraps the
Linear GraphQL API and returns compact [TOON](https://toonformat.dev/) output
with next-step hints, so an AI agent completes Linear tasks in **fewer turns and
tokens** than the Linear MCP - at the same success rate.

```
$ linear-axi
bin: ~/.local/bin/linear-axi
description: Manage Linear issues from the current workspace, agent-first
context:
  viewer: Ada Lovelace
  team: ENG
count: 2
issues[2]{id,title,state}:
  ENG-431,Fix OAuth refresh loop,In Progress
  ENG-402,Flaky pagination test,Todo
help[2]:
  Run `linear-axi issue view <id>` for full details
  Run `linear-axi issue update <id> --state Done` to change status
```

## Why

MCP servers load a tool schema into the model's context on every turn; human
CLIs separate action from observation and print prose. Both cost agents tokens
and turns. AXI is a set of 10 design principles for CLIs that agents drive over
the shell - token-efficient TOON output, minimal schemas, combined operations,
structured errors, and contextual next-step hints.

## Benchmark

Same agent (Claude Sonnet), same 10 Linear tasks (read + write), four interfaces,
verified programmatically against Linear state. See [`bench/`](bench/README.md).

| Interface | Success | Avg cost | Avg turns | Avg input tokens | Avg time |
|---|---:|---:|---:|---:|---:|
| **linear-axi** | 100% | **$0.058** | **3.7** | 90,295 | **9.7s** |
| raw GraphQL (curl) | 100% | $0.065 | 3.7 | 88,262 | 12.0s |
| Linear MCP | 100% | $0.121 | 5.5 | 144,860 | 14.5s |
| @schpet/linear-cli (human CLI) | 80% | $0.194 | 10.6 | 322,701 | 41.8s |

**vs Linear MCP: -52% cost, -33% turns, -38% input tokens, at equal 100% success.**
linear-axi is Pareto-best across every metric.

## Install

Requires Node.js 20+.

```bash
# zero-install (recommended for agents)
npx -y linear-axi

# or global
npm install -g linear-axi
```

Set a personal API key (Linear -> Settings -> Security & access -> Personal API keys).
Save it once so it works from any directory:

```bash
linear-axi setup auth --key lin_api_xxx --team ENG
```

This writes `~/.config/linear-axi/config.json` (0600). Or use env vars instead
(env takes precedence; a `.env` in the working directory also works):

```bash
export LINEAR_API_KEY=lin_api_xxx
export LINEAR_AXI_DEFAULT_TEAM=ENG   # optional; lets you omit --team
```

## Usage

```
linear-axi                       home view: your open issues + next steps
linear-axi issue list [flags]    --assignee --state --team --query --limit --fields
linear-axi issue view <id>       [--full]
linear-axi issue create          --title (req) [--team --description --priority
                                 --assignee --state --label --parent --comment]
linear-axi issue update <id>     [--title --state --assignee --priority --label
                                 --description --comment]
linear-axi issue comment <id>    [--body "..."]   (omit --body to list comments)
linear-axi setup auth            save your API key (works from any directory)
linear-axi setup hooks           install ambient-context session hooks
```

Combined operations keep round-trips low - one call can change status, assignee,
and add a comment:

```bash
linear-axi issue update ENG-431 --state "In Progress" --assignee @me --comment "started"
linear-axi issue create --title "Fix login" --priority high --comment "repro attached"
```

Every subcommand has a concise `--help`. Errors and their fixes print to stdout
in the same TOON format as normal output, with exit codes `0` (success/no-op),
`1` (error), `2` (usage error).

## Ambient context (session hooks)

Run once to load your open issues into every new agent session automatically
(Claude Code, Codex, OpenCode):

```bash
linear-axi setup hooks            # --agent claude|codex|opencode|all, --uninstall
```

Opt-in, idempotent, and self-repairing (updates the executable path on re-run).

## Agent skill

An installable [Agent Skill](https://agentskills.io) ships in
[`skills/linear-axi`](skills/linear-axi/SKILL.md) for on-demand guidance without
per-session cost. Use the hook for ambient context, the skill for broad agent
support - either or both.

## AXI principles

linear-axi implements all 10 AXI principles: TOON output, minimal default
schemas, content truncation with `--full`, pre-computed aggregates, definitive
empty states, structured errors and exit codes, ambient context hooks,
content-first home view, contextual next-step disclosure, and consistent
per-command `--help`.

## Development

```bash
npm install
npm run build          # compile TypeScript to dist/
npm run dev -- issue list
npm test               # vitest unit tests
npm run typecheck
npm run bench          # run the benchmark harness (see bench/README.md)
```

## License

MIT
