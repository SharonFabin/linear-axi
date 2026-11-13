---
name: linear-axi
description: Manage Linear issues (list, view, create, update, comment) and labels from the shell with token-efficient TOON output. Use for any Linear task run via CLI.
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

- Auth (any one): `npx -y @pgalka0/linear-axi setup auth --key lin_api_...` to save it to
  `~/.config/linear-axi/config.json`, or set `LINEAR_API_KEY`, or a `.env` in the
  working directory. Env takes precedence over the saved config.
- Optional: `--team` on `setup auth`, or `LINEAR_AXI_DEFAULT_TEAM`, sets the
  default team so `--team` can be omitted.
- Invoke without a global install: `npx -y @pgalka0/linear-axi <command>`.
- If `linear-axi` is already on your `PATH` (global install or a `setup hooks`
  run), call it directly as `linear-axi <command>` to skip the ~1-2s `npx`
  cold-start on every call. The home view prints the resolved `bin:` path.

## When to use

- Listing, searching, or counting Linear issues (by assignee, state, team, keyword).
- Reading one issue's details (description, status, labels, comments, sub-issues).
- Creating issues, changing status/assignee/priority/labels, adding comments.
- Any multi-step Linear workflow where you want few round-trips.

## Workflow

1. Run with no arguments to see live context (your open issues) and discover commands:
   ```
   npx -y @pgalka0/linear-axi
   ```
2. Narrow down with `issue list`; every list ends with `count:` and next-step hints.
   `--query` searches title + description by default; pass comma-separated terms
   to match any (OR), so one "did we build this?" audit call covers several synonyms:
   ```
   npx -y @pgalka0/linear-axi issue list --assignee @me --state open
   npx -y @pgalka0/linear-axi issue list --query "oauth,sso,login" --fields priority,project
   npx -y @pgalka0/linear-axi issue list --query "deploy" --in title,comments
   ```
3. Open one issue for full detail (description is truncated; add `--full` for all of it):
   ```
   npx -y @pgalka0/linear-axi issue view TEAM-123
   ```
4. Mutate. Combine operations to save turns - one call can set status, assignee, and
   comment; several ids batch the same change in one call:
   ```
   npx -y @pgalka0/linear-axi issue update TEAM-123 --state "In Progress" --assignee @me --comment "started"
   npx -y @pgalka0/linear-axi issue update TEAM-1 TEAM-2 TEAM-3 --state Done
   npx -y @pgalka0/linear-axi issue create --title "Spec" --description-file ./spec.md
   ```
5. Discover any subcommand's flags with `--help`; it prints a concise reference, not a manual.
   Use `team list` to discover team keys and how many projects each team holds.

## Commands

```
linear-axi                       home view: your open issues + next steps
linear-axi issue list [flags]    --assignee --state --team --project --milestone
                                 --query --in --limit --fields
linear-axi issue view <id>       [--full]   (shows project + milestone)
linear-axi issue create          --title (req) --team --description[-file] --priority
                                 --assignee --state --label --add-label --parent --comment[-file]
linear-axi issue update <id...>  --title --state --assignee --priority --label
                                 --add-label --remove-label
                                 --description[-file] --comment[-file]  (accepts many ids)
linear-axi issue comment <id>    [--body "..."]   (omit --body to list comments)
linear-axi team list             team keys, names, and project counts
linear-axi label list            --team --all  (team + workspace labels, group, color)
linear-axi label create          --name (req) --color --description --team|--workspace --parent
linear-axi label update <n|id>   --name --color --description --parent <group|none> --team
linear-axi label delete <n|id>   --yes (required) --team
linear-axi milestone list        --project <p>: a project's milestones
linear-axi setup auth            save API key/team to config (works anywhere)
linear-axi setup hooks           install ambient-context session hooks
```

## Tips

- Output is TOON, not JSON: rows are `field,field,field` under a `name[N]{cols}:` header. Parse by columns.
- Lists default to a minimal schema (id, title, state, assignee). Ask for more with `--fields`.
- `--assignee` accepts `@me`, a name/email, or `none` (unassigned). `--state` accepts `open`, `all`, `done`, `canceled`, or an exact state name.
- Mutations are idempotent: setting a value that already holds is a no-op with exit code 0.
- Prefer combined calls: `issue update ... --comment` and `issue create ... --comment` avoid a second round-trip.
- Batch: `issue update` accepts several ids at once (`update A-1 A-2 --state Done`); each row reports its own result and a bad id fails only that row (exit 1 overall).
- Search scope: `--query` matches title + description by default. Widen or narrow with `--in title,description,comments`; comma-separated terms are OR'd.
- Shared teams: use `team list` to see project counts, then scope a noisy team with `issue list --team X --project "..."` (or add `project` to `--fields`).
- Milestone work ("finish milestone 3"): `milestone list --project "<p>"` names a project's milestones, then `issue list --milestone "<name>"` lists that milestone's issues; `milestone` and `project` are both `--fields` columns and appear in `issue view`.
- Long bodies: pass `--description-file`/`--comment-file <path>` (or `-` for stdin) instead of a shell-escaped `--description`/`--comment`. `create` echoes the saved char count so you can trust it landed.
- Labels: `--label a,b` REPLACES all labels; use `--add-label a,b` / `--remove-label c` to change a few and keep the rest (cannot combine with `--label`). Names resolve team label first, then workspace; unknown names are an error.
- `label update/delete` take a name or id; a name used in several teams errors with the candidates, so add `--team <key>` or pass the id. `label delete` needs `--yes`.
- Omitting `--assignee` on create leaves the issue unassigned (not you).
- Exit codes: 0 success (incl. no-ops), 1 error, 2 usage error. Errors and their fixes print to stdout in the same format as normal output.
- Run `linear-axi setup hooks` once to load your open issues into every new session automatically.
