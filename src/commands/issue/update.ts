/**
 * `linear-axi issue update <id...> [flags]` - mutate one or more issues idempotently.
 * Only fields that actually differ are sent; if the desired state already holds,
 * the command is a no-op with exit code 0 (principle #6). Multiple ids batch the
 * same change in one call (they may even span teams).
 */
import { gql } from "../../linear/client.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { AxiError, usageError } from "../../lib/errors.js";
import { resolveBody } from "../../lib/input.js";
import { print, printLine, type Help } from "../../output/toon.js";
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
  "description-file": { type: "string", description: "read the body from a file, or - for stdin" },
  state: { type: "string", description: "workflow state name or keyword (done, todo, ...)" },
  assignee: { type: "string", description: "@me | <name/email> | none" },
  priority: { type: "string", description: "none | urgent | high | medium | low" },
  label: { type: "string", description: "label names, comma-separated (replaces labels)" },
  comment: { type: "string", description: "also add a comment in the same call" },
  "comment-file": { type: "string", description: "read the comment from a file, or - for stdin" },
};

const HELP = `linear-axi issue update <id...> - change one or more issues (idempotent)

Arguments:
  <id...>      one or more issue identifiers, e.g. MYT-42 MYT-43

Flags:
  --title "..."         new title (single-issue only)
  --description "..."    new body
  --description-file <p> read the body from a file, or - for stdin
  --state <s>           workflow state name or keyword (done, todo, ...)
  --assignee <a>        @me | <name/email> | none
  --priority <p>        none | urgent | high | medium | low
  --label a,b           replace labels with these names
  --comment "..."       add a comment as part of this update (one call)
  --comment-file <p>    read the comment from a file, or - for stdin

Examples:
  linear-axi issue update MYT-42 --state Done
  linear-axi issue update MYT-42 --state "In Progress" --assignee @me --comment "started"
  linear-axi issue update MYT-1 MYT-2 MYT-3 --state Done`;

/** Inputs resolved once and applied to every id in a batch. */
interface UpdateOp {
  title?: string;
  description?: string;
  state?: string;
  assignee?: { id: string | null };
  priority?: number;
  labels?: string[];
  comment?: string;
}

interface UpdateResult {
  identifier: string;
  state: string;
  assignee: string;
  priority: string;
  changes: string[];
  noops: string[];
}

export async function issueUpdate(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "issue update");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const ids = parsed.positionals;
  if (ids.length === 0) {
    throw usageError("issue id is required", ["linear-axi issue update <id> --state Done"]);
  }

  const description = resolveBody(
    parsed.flags.description as string | undefined,
    parsed.flags["description-file"] as string | undefined,
    "description",
  );
  const comment = resolveBody(
    parsed.flags.comment as string | undefined,
    parsed.flags["comment-file"] as string | undefined,
    "comment",
  );
  if (comment !== undefined && comment.trim().length === 0) {
    throw usageError("--comment cannot be empty", [`linear-axi issue update ${ids[0]} --comment "..."`]);
  }

  const title = parsed.flags.title as string | undefined;
  if (title !== undefined && ids.length > 1) {
    throw usageError("--title cannot be applied to multiple issues", [
      "Set titles one issue at a time",
    ]);
  }

  const op: UpdateOp = {};
  if (title !== undefined) op.title = title;
  if (description !== undefined) op.description = description;
  if (typeof parsed.flags.state === "string") op.state = parsed.flags.state;
  if (typeof parsed.flags.priority === "string") op.priority = priorityToNumber(parsed.flags.priority);
  if (typeof parsed.flags.assignee === "string") {
    op.assignee = { id: await resolveAssigneeId(parsed.flags.assignee) };
  }
  if (typeof parsed.flags.label === "string") op.labels = splitList(parsed.flags.label);

  const hasFieldOp =
    op.title !== undefined ||
    op.description !== undefined ||
    op.state !== undefined ||
    op.assignee !== undefined ||
    op.priority !== undefined ||
    op.labels !== undefined;
  if (!hasFieldOp && comment === undefined) {
    throw usageError("nothing to update - pass at least one field", [
      "e.g. linear-axi issue update " + ids[0] + " --state Done",
    ]);
  }

  // Single id: keep the precise, throwing behaviour (exact exit codes and help).
  if (ids.length === 1) {
    const r = await updateOne(ids[0]!, op, comment);
    if (r.changes.length === 0) {
      printLine(`${r.identifier}: no changes (${r.noops.join(", ") || "nothing to do"})`);
      return 0;
    }
    print({
      updated: {
        id: r.identifier,
        state: r.state,
        assignee: r.assignee,
        priority: r.priority,
        changed: r.changes.join(", "),
      },
    });
    return 0;
  }

  // Bulk: apply to each id, collecting errors instead of aborting the batch.
  const rows: Record<string, string>[] = [];
  let anyError = false;
  for (const id of ids) {
    try {
      const r = await updateOne(id, op, comment);
      rows.push({
        id: r.identifier,
        state: r.state,
        changed: r.changes.length > 0 ? r.changes.join(", ") : `no changes (${r.noops.join(", ") || "up to date"})`,
      });
    } catch (err) {
      anyError = true;
      rows.push({ id, state: "-", changed: `error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const help: Help = ["Run `linear-axi issue view <id>` to confirm any single issue"];
  print({ count: rows.length, results: rows }, help);
  return anyError ? 1 : 0;
}

/** Apply the resolved op to one issue. Throws AxiError on any problem. */
async function updateOne(id: string, op: UpdateOp, comment: string | undefined): Promise<UpdateResult> {
  const ref = await resolveIssueRef(id);
  const input: Record<string, unknown> = {};
  const changes: string[] = [];
  const noops: string[] = [];

  if (op.title !== undefined) {
    if (op.title !== ref.title) {
      input.title = op.title;
      changes.push("title");
    } else noops.push("title already set");
  }

  if (op.description !== undefined) {
    input.description = op.description;
    changes.push("description");
  }

  if (op.state !== undefined) {
    const state = await resolveStateId(ref.team.id, op.state);
    if (state.name.toLowerCase() !== (ref.state?.name ?? "").toLowerCase()) {
      input.stateId = state.id;
      changes.push(`state -> ${state.name}`);
    } else noops.push(`state already ${state.name}`);
  }

  if (op.assignee !== undefined) {
    const target = op.assignee.id;
    const current = ref.assignee?.id ?? null;
    if (target !== current) {
      input.assigneeId = target; // null unassigns
      changes.push(target ? "assignee" : "assignee -> none");
    } else noops.push("assignee already set");
  }

  if (op.priority !== undefined) {
    if (op.priority !== ref.priority) {
      input.priority = op.priority;
      changes.push(`priority -> ${PRIORITY_LABELS[op.priority]}`);
    } else noops.push(`priority already ${PRIORITY_LABELS[op.priority]}`);
  }

  if (op.labels !== undefined) {
    const ids = await resolveLabelIds(ref.team.id, op.labels);
    const current = new Set(ref.labels.map((l) => l.id));
    const same = ids.length === current.size && ids.every((i) => current.has(i));
    if (!same) {
      input.labelIds = ids;
      changes.push("labels");
    } else noops.push("labels already set");
  }

  let issue: UpdatedIssue | null = null;
  if (Object.keys(input).length > 0) {
    const data = await gql<{ issueUpdate: { success: boolean; issue: UpdatedIssue | null } }>(
      UPDATE_MUTATION,
      { id: ref.identifier, input },
    );
    issue = data.issueUpdate.issue;
    if (!data.issueUpdate.success || !issue) {
      throw new AxiError("issue update failed", { exitCode: 1, help: ["Check the field values, then retry"] });
    }
  }

  if (comment !== undefined) {
    const cdata = await gql<{ commentCreate: { success: boolean } }>(
      `mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success } }`,
      { input: { issueId: ref.uuid, body: comment } },
    );
    if (!cdata.commentCreate.success) {
      throw new AxiError("comment failed", { exitCode: 1, help: ["Check the issue id and retry"] });
    }
    changes.push("comment");
  }

  return {
    identifier: ref.identifier,
    state: issue?.state?.name ?? ref.state?.name ?? "-",
    assignee: issue?.assignee?.displayName ?? ref.assignee?.displayName ?? "-",
    priority: PRIORITY_LABELS[issue?.priority ?? ref.priority] ?? "-",
    changes,
    noops,
  };
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
