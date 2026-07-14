/**
 * `linear-axi issue list` - the read workhorse.
 * Minimal default schema (principle #2), definitive empty state (#5),
 * cheap aggregate + next-step help (#4, #9).
 */
import { gql, getClient } from "../../linear/client.js";
import { resolveTeamScope } from "../../lib/context.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { splitList, isUuid } from "../../linear/resolve.js";
import { usageError } from "../../lib/errors.js";
import { print, printLine, type Help } from "../../output/toon.js";

const SCHEMA: FlagSchema = {
  assignee: { type: "string", description: "@me, a user's name/email, or none (default: anyone)" },
  state: { type: "string", description: "open (default), all, done, canceled, or an exact state name" },
  team: { type: "string", description: "team key or name (default: LINEAR_AXI_DEFAULT_TEAM)" },
  project: { type: "string", description: "project name (case-insensitive match)" },
  milestone: { type: "string", description: "project milestone name or id" },
  query: { type: "string", description: "text match; comma-separated terms match any (OR)" },
  in: { type: "string", description: "search scope: title,description,comments (default: title,description)" },
  limit: { type: "string", description: "max issues to return (default: 30)" },
  fields: { type: "string", description: "extra columns, comma-separated: priority,updated,team,project,milestone,url" },
};

const HELP = `linear-axi issue list - list issues with a minimal schema

Flags:
  --assignee   @me | <name/email> | none        (default: anyone)
  --state      open | all | done | canceled | <state name>   (default: open)
  --team       <key or name>                     (default: LINEAR_AXI_DEFAULT_TEAM)
  --project    <name>                            (case-insensitive contains)
  --milestone  <name or id>                      (project milestone)
  --query      <text[,text...]>                  (comma-separated terms match any)
  --in         title,description,comments        (search scope; default: title,description)
  --limit      <n>                               (default: 30)
  --fields     priority,updated,team,project,milestone,url  (extra columns)

Search:
  --query matches case-insensitively. By default it searches title AND
  description; widen or narrow with --in. Multiple comma-separated terms are
  OR'd, so one call can cover several synonyms.

Examples:
  linear-axi issue list --assignee @me
  linear-axi issue list --team MYT --state done --limit 50
  linear-axi issue list --query "oauth,sso,login" --fields priority,project
  linear-axi issue list --milestone "Milestone 3" --fields milestone
  linear-axi issue list --query "deploy" --in title,comments`;

interface IssueNode {
  identifier: string;
  title: string;
  priority: number;
  priorityLabel: string;
  updatedAt: string;
  url: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
  team: { key: string } | null;
  project: { name: string } | null;
  projectMilestone: { name: string } | null;
}

const BASE_FIELDS = ["id", "title", "state", "assignee"] as const;
const EXTRA_FIELDS = new Set(["priority", "updated", "team", "project", "milestone", "url"]);
const SEARCH_SCOPES = new Set(["title", "description", "comments"]);
const DEFAULT_SCOPE = ["title", "description"];

export async function issueList(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "issue list");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const limit = clampLimit(parsed.flags.limit as string | undefined);
  const extra = parseFields(parsed.flags.fields as string | undefined);
  const searchScope = parseScope(parsed.flags.in as string | undefined);
  const scope = await resolveTeamScope(getClient(), parsed.flags.team as string | undefined);
  const team = scope.team;

  const filter = buildFilter({
    assignee: parsed.flags.assignee as string | undefined,
    state: (parsed.flags.state as string | undefined) ?? "open",
    query: parsed.flags.query as string | undefined,
    searchScope,
    project: parsed.flags.project as string | undefined,
    milestone: parsed.flags.milestone as string | undefined,
    teamKey: team?.key,
  });

  // Fetch one extra to detect whether more results exist (cheap aggregate).
  const data = await gql<{ issues: { nodes: IssueNode[]; pageInfo: { hasNextPage: boolean } } }>(
    LIST_QUERY,
    { first: limit + 1, filter },
  );

  const nodes = data.issues.nodes;
  const hasMore = nodes.length > limit || data.issues.pageInfo.hasNextPage;
  const shown = nodes.slice(0, limit);

  const scopeLabel = describeScope(parsed.flags, team?.key);
  if (shown.length === 0) {
    const emptyHelp = [
      `Run \`linear-axi issue list --state all\` to include done/canceled issues`,
      `Run \`linear-axi issue create --title "..."${team ? ` --team ${team.key}` : ""}\` to add one`,
    ];
    if (scope.note) emptyHelp.unshift(`note: ${scope.note}`);
    printLine(`issues: 0 issues found ${scopeLabel}`, emptyHelp);
    return 0;
  }

  const fields = [...BASE_FIELDS, ...extra];
  const rows = shown.map((n) => rowFor(n, fields));

  const body = { count: shown.length, issues: rows };
  const help = listHelp(team?.key);
  if (hasMore) {
    help.push(`Showing ${shown.length}; run \`linear-axi issue list --limit ${limit * 2}\` for more`);
  }
  if (scope.note) help.unshift(`note: ${scope.note}`);

  print(body, help);
  return 0;
}

const LIST_QUERY = `query($first:Int!, $filter:IssueFilter){
  issues(first:$first, filter:$filter, orderBy:updatedAt){
    pageInfo{ hasNextPage }
    nodes{
      identifier title priority priorityLabel updatedAt url
      state{ name } assignee{ displayName } team{ key } project{ name } projectMilestone{ name }
    }
  }
}`;

function rowFor(n: IssueNode, fields: string[]): Record<string, string> {
  const row: Record<string, string> = {};
  for (const f of fields) {
    switch (f) {
      case "id": row.id = n.identifier; break;
      case "title": row.title = n.title; break;
      case "state": row.state = n.state?.name ?? "-"; break;
      case "assignee": row.assignee = n.assignee?.displayName ?? "-"; break;
      case "priority": row.priority = n.priorityLabel; break;
      case "updated": row.updated = n.updatedAt.slice(0, 10); break;
      case "team": row.team = n.team?.key ?? "-"; break;
      case "project": row.project = n.project?.name ?? "-"; break;
      case "milestone": row.milestone = n.projectMilestone?.name ?? "-"; break;
      case "url": row.url = n.url; break;
    }
  }
  return row;
}

function listHelp(teamKey?: string): Help {
  const t = teamKey ? ` --team ${teamKey}` : "";
  return [
    "Run `linear-axi issue view <id>` for full details",
    "Run `linear-axi issue update <id> --state Done` to change status",
    `Run \`linear-axi issue create --title "..."${t}\` to add an issue`,
  ];
}

interface FilterInput {
  assignee?: string;
  state: string;
  query?: string;
  searchScope: string[];
  project?: string;
  milestone?: string;
  teamKey?: string;
}

function buildFilter(input: FilterInput): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (input.teamKey) filter.team = { key: { eq: input.teamKey } };
  if (input.project) filter.project = { name: { containsIgnoreCase: input.project } };
  if (input.milestone) {
    filter.projectMilestone = isUuid(input.milestone)
      ? { id: { eq: input.milestone } }
      : { name: { containsIgnoreCase: input.milestone } };
  }

  const a = input.assignee?.toLowerCase();
  if (a === "@me" || a === "me") filter.assignee = { isMe: { eq: true } };
  else if (a === "none" || a === "unassigned") filter.assignee = { null: true };
  else if (input.assignee) filter.assignee = { displayName: { containsIgnoreCase: input.assignee } };

  const s = input.state.toLowerCase();
  if (s === "all") {
    /* no state filter */
  } else if (s === "open") {
    filter.state = { type: { nin: ["completed", "canceled"] } };
  } else if (s === "done" || s === "completed") {
    filter.state = { type: { eq: "completed" } };
  } else if (s === "canceled" || s === "cancelled") {
    filter.state = { type: { eq: "canceled" } };
  } else {
    filter.state = { name: { eqIgnoreCase: input.state } };
  }

  // Multiple comma-separated terms across the chosen scope are OR'd, so an
  // "audit" pass ("did we build any of these?") collapses into one call.
  const terms = splitList(input.query);
  if (terms.length > 0) {
    const or: Record<string, unknown>[] = [];
    for (const term of terms) {
      for (const field of input.searchScope) {
        or.push(scopeMatch(field, term));
      }
    }
    filter.or = or;
  }

  return filter;
}

function scopeMatch(field: string, term: string): Record<string, unknown> {
  if (field === "comments") return { comments: { some: { body: { containsIgnoreCase: term } } } };
  return { [field]: { containsIgnoreCase: term } };
}

function parseScope(raw?: string): string[] {
  if (!raw) return DEFAULT_SCOPE;
  const scopes = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const bad = scopes.filter((s) => !SEARCH_SCOPES.has(s));
  if (bad.length > 0 || scopes.length === 0) {
    throw usageError(`invalid --in scope: ${bad.join(", ") || "(empty)"}`, [
      "valid: title, description, comments (comma-separated)",
    ]);
  }
  return scopes;
}

function describeScope(flags: Record<string, string | boolean>, teamKey?: string): string {
  const parts: string[] = [];
  const state = (flags.state as string | undefined) ?? "open";
  parts.push(`(state: ${state}`);
  if (flags.assignee) parts.push(`assignee: ${flags.assignee}`);
  if (teamKey) parts.push(`team: ${teamKey}`);
  if (flags.project) parts.push(`project: "${flags.project}"`);
  if (flags.milestone) parts.push(`milestone: "${flags.milestone}"`);
  if (flags.query) parts.push(`query: "${flags.query}"`);
  return parts.join(", ") + ")";
}

function clampLimit(raw?: string): number {
  if (!raw) return 30;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return 30;
  return Math.min(n, 250);
}

function parseFields(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .filter((f) => EXTRA_FIELDS.has(f));
}
