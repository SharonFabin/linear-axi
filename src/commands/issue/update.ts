/**
 * `linear-axi issue update <id> [flags]` - mutate an issue idempotently.
 * Only fields that actually differ are sent; if the desired state already holds,
 * the command is a no-op with exit code 0 (principle #6).
 */
import { gql } from "../../linear/client.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { usageError } from "../../lib/errors.js";
import { print, printLine } from "../../output/toon.js";
import {
  priorityToNumber,
  PRIORITY_LABELS,
  resolveAssigneeId,
  resolveStateId,
  resolveLabelIds,
  resolveIssueRef,
  splitList,
} from "../../linear/resolve.js";

const SCHEMA: FlagSchema = {
  title: { type: "string", description: "new title" },
  description: { type: "string", description: "new body (markdown)" },
  state: { type: "string", description: "workflow state name or keyword (done, todo, ...)" },
  assignee: { type: "string", description: "@me | <name/email> | none" },
  priority: { type: "string", description: "none | urgent | high | medium | low" },
  label: { type: "string", description: "label names, comma-separated (replaces labels)" },
  comment: { type: "string", description: "also add a comment in the same call" },
};

const HELP = `linear-axi issue update <id> - change an issue (idempotent)

Arguments:
  <id>         issue identifier, e.g. MYT-42

Flags:
  --title "..."       new title
  --description "..."  new body
  --state <s>         workflow state name or keyword (done, todo, ...)
  --assignee <a>      @me | <name/email> | none
  --priority <p>      none | urgent | high | medium | low
  --label a,b         replace labels with these names
  --comment "..."     add a comment as part of this update (one call)

Examples:
  linear-axi issue update MYT-42 --state Done
  linear-axi issue update MYT-42 --state "In Progress" --assignee @me --comment "started"`;

export async function issueUpdate(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "issue update");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const id = parsed.positionals[0];
  if (!id) throw usageError("issue id is required", ["linear-axi issue update <id> --state Done"]);

  const flagsGiven = Object.keys(parsed.flags).length > 0;
  if (!flagsGiven) {
    throw usageError("nothing to update - pass at least one field", [
      "e.g. linear-axi issue update " + id + " --state Done",
    ]);
  }

  const ref = await resolveIssueRef(id);
  const input: Record<string, unknown> = {};
  const changes: string[] = [];
  const noops: string[] = [];

  if (typeof parsed.flags.title === "string") {
    if (parsed.flags.title !== ref.title) {
      input.title = parsed.flags.title;
      changes.push("title");
    } else noops.push("title already set");
  }

  if (typeof parsed.flags.description === "string") {
    input.description = parsed.flags.description;
    changes.push("description");
  }

  if (typeof parsed.flags.state === "string") {
    const state = await resolveStateId(ref.team.id, parsed.flags.state);
    if (state.name.toLowerCase() !== (ref.state?.name ?? "").toLowerCase()) {
      input.stateId = state.id;
      changes.push(`state -> ${state.name}`);
    } else noops.push(`state already ${state.name}`);
  }

  if (typeof parsed.flags.assignee === "string") {
    const target = await resolveAssigneeId(parsed.flags.assignee);
    const current = ref.assignee?.id ?? null;
    if (target !== current) {
      input.assigneeId = target; // null unassigns
      changes.push(target ? "assignee" : "assignee -> none");
    } else noops.push("assignee already set");
  }

  if (typeof parsed.flags.priority === "string") {
    const p = priorityToNumber(parsed.flags.priority);
    if (p !== ref.priority) {
      input.priority = p;
      changes.push(`priority -> ${PRIORITY_LABELS[p]}`);
    } else noops.push(`priority already ${PRIORITY_LABELS[p]}`);
  }

  if (typeof parsed.flags.label === "string") {
    const names = splitList(parsed.flags.label);
    const ids = await resolveLabelIds(ref.team.id, names);
    const current = new Set(ref.labels.map((l) => l.id));
    const same = ids.length === current.size && ids.every((i) => current.has(i));
    if (!same) {
      input.labelIds = ids;
      changes.push("labels");
    } else noops.push("labels already set");
  }

  const commentBody = typeof parsed.flags.comment === "string" ? parsed.flags.comment : undefined;
  if (commentBody !== undefined && commentBody.trim().length === 0) {
    throw usageError("--comment cannot be empty", [`linear-axi issue update ${id} --comment "..."`]);
  }

  if (changes.length === 0 && commentBody === undefined) {
    printLine(`${ref.identifier}: no changes (${noops.join(", ") || "nothing to do"})`);
    return 0; // idempotent no-op
  }

  // Field changes (if any) go in one issueUpdate call...
  let issue: UpdatedIssue | null = null;
  if (Object.keys(input).length > 0) {
    const data = await gql<{ issueUpdate: { success: boolean; issue: UpdatedIssue | null } }>(
      UPDATE_MUTATION,
      { id: ref.identifier, input },
    );
    issue = data.issueUpdate.issue;
    if (!data.issueUpdate.success || !issue) {
      throw usageError("issue update failed", ["Check the field values, then retry"]);
    }
  }

  // ...and the optional comment in the same invocation (combined operation).
  if (commentBody !== undefined) {
    const cdata = await gql<{ commentCreate: { success: boolean } }>(
      `mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success } }`,
      { input: { issueId: ref.uuid, body: commentBody } },
    );
    if (!cdata.commentCreate.success) throw usageError("comment failed", ["Check the issue id and retry"]);
    changes.push("comment");
  }

  print({
    updated: {
      id: ref.identifier,
      state: issue?.state?.name ?? ref.state?.name ?? "-",
      assignee: issue?.assignee?.displayName ?? ref.assignee?.displayName ?? "-",
      priority: PRIORITY_LABELS[issue?.priority ?? ref.priority] ?? "-",
      changed: changes.join(", "),
    },
  });
  return 0;
}

interface UpdatedIssue {
  identifier: string;
  priority: number;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
}

const UPDATE_MUTATION = `mutation($id:String!, $input:IssueUpdateInput!){
  issueUpdate(id:$id, input:$input){
    success
    issue{ identifier priority state{ name } assignee{ displayName } }
  }
}`;
