#!/usr/bin/env node
/**
 * linear-axi entry point: argument routing + content-first home view.
 * Principles #8 (content first), #10 (tool identity + consistent help).
 */
import os from "node:os";
import { gql, getClient } from "./linear/client.js";
import { resolveTeamScope, resolveViewer } from "./lib/context.js";
import { AxiError } from "./lib/errors.js";
import { toon, print, printLine, printError, type Help } from "./output/toon.js";
import { issueList } from "./commands/issue/list.js";
import { issueView } from "./commands/issue/view.js";
import { issueCreate } from "./commands/issue/create.js";
import { issueUpdate } from "./commands/issue/update.js";
import { issueComment } from "./commands/issue/comment.js";
import { setupHooks } from "./setup/hooks.js";
import { setupAuth } from "./setup/auth.js";

const DESCRIPTION = "Manage Linear issues from the current workspace, agent-first";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [cmd, ...rest] = argv;

  if (!cmd) return home();

  if (cmd === "--help" || cmd === "-h" || cmd === "help") {
    printLine(topHelp());
    return 0;
  }

  if (cmd === "issue") return routeIssue(rest);
  if (cmd === "setup") return routeSetup(rest);

  throw new AxiError(`unknown command \`${cmd}\``, {
    exitCode: 2,
    help: ["valid commands: issue (list|view|create|update|comment), setup (auth|hooks)", "Run `linear-axi --help`"],
  });
}

async function routeSetup(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "auth") return setupAuth(rest);
  if (sub === "hooks") return setupHooks(rest);
  throw new AxiError(`unknown subcommand \`setup ${sub ?? ""}\``.trim(), {
    exitCode: 2,
    help: ["valid: linear-axi setup auth | setup hooks"],
  });
}

async function routeIssue(argv: string[]): Promise<number> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "list":
      return issueList(rest);
    case "view":
      return issueView(rest);
    case "create":
      return issueCreate(rest);
    case "update":
      return issueUpdate(rest);
    case "comment":
      return issueComment(rest);
    case undefined:
      // `issue` with no subcommand behaves like `issue list` (content first).
      return issueList([]);
    default:
      throw new AxiError(`unknown subcommand \`issue ${sub}\``, {
        exitCode: 2,
        help: ["valid subcommands: issue list | view | create | update | comment"],
      });
  }
}

/** Content-first home view: tool identity + my open issues (principles #8, #10). */
async function home(): Promise<number> {
  const viewer = await resolveViewer(getClient());

  // Default team is best-effort: if it can't resolve, show all my open issues.
  const scope = await resolveTeamScope(getClient());
  const teamKey = scope.team?.key;
  const teamNote = scope.note;

  const filter: Record<string, unknown> = {
    assignee: { isMe: { eq: true } },
    state: { type: { nin: ["completed", "canceled"] } },
  };
  if (teamKey) filter.team = { key: { eq: teamKey } };

  const data = await gql<{ issues: { nodes: HomeIssue[]; pageInfo: { hasNextPage: boolean } } }>(
    HOME_QUERY,
    { first: 11, filter },
  );
  const nodes = data.issues.nodes;
  const hasMore = nodes.length > 10 || data.issues.pageInfo.hasNextPage;
  const shown = nodes.slice(0, 10);

  const context: Record<string, string> = { viewer: viewer.displayName };
  if (teamKey) context.team = teamKey;
  if (teamNote) context.note = teamNote;

  const header =
    `bin: ${binPath()}\n` +
    `description: ${DESCRIPTION}\n` +
    toon({ context });

  if (shown.length === 0) {
    printLine(header + `\nissues: 0 open issues assigned to you`, [
      "Run `linear-axi issue list --assignee none` to see unassigned issues",
      'Run `linear-axi issue create --title "..." --team <key>` to add one',
    ]);
    return 0;
  }

  const body = {
    count: shown.length,
    issues: shown.map((n) => ({
      id: n.identifier,
      title: n.title,
      state: n.state?.name ?? "-",
    })),
  };

  process.stdout.write(header + "\n" + toon(body) + "\n" + renderHomeHelp(hasMore) + "\n");
  return 0;
}

interface HomeIssue {
  identifier: string;
  title: string;
  state: { name: string } | null;
}

const HOME_QUERY = `query($first:Int!, $filter:IssueFilter){
  issues(first:$first, filter:$filter, orderBy:updatedAt){
    pageInfo{ hasNextPage }
    nodes{ identifier title state{ name } }
  }
}`;

function renderHomeHelp(hasMore: boolean): string {
  const help: Help = [
    "Run `linear-axi issue view <id>` for full details",
    "Run `linear-axi issue update <id> --state Done` to change status",
  ];
  if (hasMore) help.push("Run `linear-axi issue list --assignee @me` for all your open issues");
  return "help[" + help.length + "]:\n" + help.map((h) => "  " + h).join("\n");
}

function binPath(): string {
  const p = process.argv[1] ?? "linear-axi";
  const home = os.homedir();
  return p.startsWith(home) ? p.replace(home, "~") : p;
}

function topHelp(): string {
  return `linear-axi - ${DESCRIPTION}

Usage:
  linear-axi                       show your open issues (content-first home)
  linear-axi issue list [flags]    list issues (see: issue list --help)
  linear-axi issue view <id>       show one issue in detail
  linear-axi issue create ...      create an issue
  linear-axi issue update <id> ... update an issue (idempotent)
  linear-axi issue comment <id> .. add or list comments
  linear-axi setup auth ...        save your API key (works from any directory)
  linear-axi setup hooks           install ambient-context session hooks

Auth:
  linear-axi setup auth --key lin_api_... [--team <key>]
  or set LINEAR_API_KEY (Linear -> Settings -> Security & access -> Personal API keys).`;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => process.exit(printError(err instanceof Error ? err : new Error(String(err)))));
