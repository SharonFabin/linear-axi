/**
 * `linear-axi issue create --title "..."` - create an issue.
 * Requires a team (explicit --team or a resolvable default). Missing/invalid
 * inputs fail fast with structured usage errors (principle #6).
 */
import { gql, getClient } from "../../linear/client.js";
import { resolveTeamScope } from "../../lib/context.js";
import { parseArgs, requireString, type FlagSchema } from "../../lib/args.js";
import { usageError } from "../../lib/errors.js";
import { resolveBody } from "../../lib/input.js";
import { print, printLine } from "../../output/toon.js";
import {
  priorityToNumber,
  resolveAssigneeId,
  resolveStateId,
  resolveIssueRef,
  splitList,
} from "../../linear/resolve.js";
import { resolveLabelIds } from "../../linear/labels.js";

const SCHEMA: FlagSchema = {
  title: { type: "string", description: "issue title (required)" },
  team: { type: "string", description: "team key or name (default: LINEAR_AXI_DEFAULT_TEAM)" },
  description: { type: "string", description: "issue body (markdown)" },
  "description-file": { type: "string", description: "read body from a file, or - for stdin" },
  priority: { type: "string", description: "none | urgent | high | medium | low" },
  assignee: { type: "string", description: "@me | <name/email> (default: unassigned)" },
  state: { type: "string", description: "workflow state name or keyword (done, todo, ...)" },
  label: { type: "string", description: "label names, comma-separated" },
  parent: { type: "string", description: "parent issue id (creates a sub-issue)" },
  comment: { type: "string", description: "add a first comment in the same call" },
  "comment-file": { type: "string", description: "read the first comment from a file, or - for stdin" },
};

const HELP = `linear-axi issue create - create a new issue

Required:
  --title "..."

Flags:
  --team <key>          team key or name (default: LINEAR_AXI_DEFAULT_TEAM)
  --description "..."    markdown body
  --description-file <p> read the body from a file, or - for stdin
  --priority <p>        none | urgent | high | medium | low
  --assignee <a>        @me | <name/email>  (default: unassigned, not you)
  --state <s>           workflow state name or keyword (done, todo, backlog, ...)
  --label a,b           label names, comma-separated
  --parent <id>         parent issue id (creates a sub-issue)
  --comment "..."       add a first comment in the same call
  --comment-file <p>    read the first comment from a file, or - for stdin

Examples:
  linear-axi issue create --title "Fix login" --team MYT
  linear-axi issue create --title "Bug" --priority high --assignee @me --label Bug
  linear-axi issue create --title "Spec" --description-file ./spec.md`;

export async function issueCreate(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "issue create");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const title = requireString(parsed, "title", "issue create", 'linear-axi issue create --title "..." --team <key>');

  const scope = await resolveTeamScope(getClient(), parsed.flags.team as string | undefined);
  if (!scope.team) {
    throw usageError("a team is required to create an issue", [
      "Pass --team <key>, or set LINEAR_AXI_DEFAULT_TEAM to a valid team",
    ]);
  }
  const team = scope.team;

  const input: Record<string, unknown> = { teamId: team.id, title };

  const description = resolveBody(
    parsed.flags.description as string | undefined,
    parsed.flags["description-file"] as string | undefined,
    "description",
  );
  if (description !== undefined) input.description = description;
  if (typeof parsed.flags.priority === "string") input.priority = priorityToNumber(parsed.flags.priority);
  if (typeof parsed.flags.assignee === "string") {
    const id = await resolveAssigneeId(parsed.flags.assignee);
    if (id) input.assigneeId = id;
  }
  if (typeof parsed.flags.state === "string") {
    input.stateId = (await resolveStateId(team.id, parsed.flags.state)).id;
  }
  const labelIds = await resolveLabelIds(team.id, splitList(parsed.flags.label as string | undefined));
  if (labelIds.length > 0) input.labelIds = labelIds;
  if (typeof parsed.flags.parent === "string") {
    input.parentId = (await resolveIssueRef(parsed.flags.parent)).uuid;
  }

  const data = await gql<{ issueCreate: { success: boolean; issue: CreatedIssue | null } }>(
    CREATE_MUTATION,
    { input },
  );

  const issue = data.issueCreate.issue;
  if (!data.issueCreate.success || !issue) {
    throw usageError("issue creation failed", ["Check the team and field values, then retry"]);
  }

  // Optional first comment in the same invocation (combined operation).
  const commentBody = resolveBody(
    parsed.flags.comment as string | undefined,
    parsed.flags["comment-file"] as string | undefined,
    "comment",
  );
  if (commentBody !== undefined && commentBody.trim().length > 0) {
    await gql(`mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success } }`, {
      input: { issueId: issue.id, body: commentBody },
    });
  }

  const created: Record<string, unknown> = {
    id: issue.identifier,
    title: issue.title,
    state: issue.state?.name ?? "-",
    assignee: issue.assignee?.displayName ?? "-",
    url: issue.url,
  };
  // Confirm the stored body size so the agent can trust a long, shell-escaped
  // --description landed, without a follow-up `issue view`.
  if (description !== undefined) created.description = `${description.length} chars saved`;
  if (commentBody !== undefined && commentBody.trim().length > 0) created.comment = "added";

  print({ created }, [`Run \`linear-axi issue view ${issue.identifier}\` for full details`]);
  return 0;
}

interface CreatedIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
}

const CREATE_MUTATION = `mutation($input:IssueCreateInput!){
  issueCreate(input:$input){
    success
    issue{ id identifier title url state{ name } assignee{ displayName } }
  }
}`;
