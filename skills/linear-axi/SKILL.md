---
name: linear-axi
description: Manage Linear issues (list, view, create, update, comment) from the shell with token-efficient TOON output. Use for any Linear task run via CLI.
user-invocable: false
author: Piotr Galka
metadata:
  hermes:
    tags: [linear, issues, project-management, tasks, productivity]
    category: productivity
---

# linear-axi

An agent-ergonomic CLI for Linear, built to the AXI (Agent eXperience Interface)
standard. It wraps the Linear GraphQL API and returns compact
[TOON](https://toonformat.dev/) output with next-step hints, so you can complete
Linear tasks in fewer turns and tokens than the Linear MCP.

## Setup

- Auth (any one): `npx -y linear-axi setup auth --key lin_api_...` to save it to
  `~/.config/linear-axi/config.json`, or set `LINEAR_API_KEY`, or a `.env` in the
  working directory. Env takes precedence over the saved config.
- Optional: `--team` on `setup auth`, or `LINEAR_AXI_DEFAULT_TEAM`, sets the
  default team so `--team` can be omitted.
- Invoke without a global install: `npx -y linear-axi <command>`.

## When to use

- Listing, searching, or counting Linear issues (by assignee, state, team, keyword).
- Reading one issue's details (description, status, labels, comments, sub-issues).
- Creating issues, changing status/assignee/priority/labels, adding comments.
- Any multi-step Linear workflow where you want few round-trips.

## Workflow

1. Run with no arguments to see live context (your open issues) and discover commands:
   ```
   npx -y linear-axi
   ```
2. Narrow down with `issue list`; every list ends with `count:` and next-step hints:
   ```
   npx -y linear-axi issue list --assignee @me --state open
   npx -y linear-axi issue list --query "oauth" --fields priority,updated
   ```
3. Open one issue for full detail (description is truncated; add `--full` for all of it):
   ```
   npx -y linear-axi issue view TEAM-123
   ```
4. Mutate. Combine operations to save turns - one call can set status, assignee, and comment:
   ```
   npx -y linear-axi issue update TEAM-123 --state "In Progress" --assignee @me --comment "started"
   npx -y linear-axi issue create --title "Fix login" --priority high --comment "repro attached"
   ```
5. Discover any subcommand's flags with `--help`; it prints a concise reference, not a manual.

## Commands

```
linear-axi                       home view: your open issues + next steps
linear-axi issue list [flags]    --assignee --state --team --query --limit --fields
linear-axi issue view <id>       [--full]
linear-axi issue create          --title (req) --team --description --priority
                                 --assignee --state --label --parent --comment
linear-axi issue update <id>     --title --state --assignee --priority --label
                                 --description --comment
linear-axi issue comment <id>    [--body "..."]   (omit --body to list comments)
linear-axi setup auth            save API key/team to config (works anywhere)
linear-axi setup hooks           install ambient-context session hooks
```

## Tips

- Output is TOON, not JSON: rows are `field,field,field` under a `name[N]{cols}:` header. Parse by columns.
- Lists default to a minimal schema (id, title, state, assignee). Ask for more with `--fields`.
- `--assignee` accepts `@me`, a name/email, or `none` (unassigned). `--state` accepts `open`, `all`, `done`, `canceled`, or an exact state name.
- Mutations are idempotent: setting a value that already holds is a no-op with exit code 0.
- Prefer combined calls: `issue update ... --comment` and `issue create ... --comment` avoid a second round-trip.
- Exit codes: 0 success (incl. no-ops), 1 error, 2 usage error. Errors and their fixes print to stdout in the same format as normal output.
- Run `linear-axi setup hooks` once to load your open issues into every new session automatically.
