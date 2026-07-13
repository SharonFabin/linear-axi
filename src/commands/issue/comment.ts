/**
 * `linear-axi issue comment <id> [--body "..."]`.
 * With --body: add a comment. Without: list existing comments (content first, #8).
 */
import { gql } from "../../linear/client.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { usageError } from "../../lib/errors.js";
import { print, printLine } from "../../output/toon.js";
import { truncate } from "../../lib/truncate.js";
import { resolveIssueRef } from "../../linear/resolve.js";

const SCHEMA: FlagSchema = {
  body: { type: "string", description: "comment text (markdown); omit to list comments" },
};

const HELP = `linear-axi issue comment <id> - add or list comments

Arguments:
  <id>         issue identifier, e.g. MYT-42

Flags:
  --body "..."  comment text; omit to list existing comments

Examples:
  linear-axi issue comment MYT-42
  linear-axi issue comment MYT-42 --body "Fixed in latest deploy"`;

export async function issueComment(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "issue comment");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const id = parsed.positionals[0];
  if (!id) throw usageError("issue id is required", ["linear-axi issue comment <id> --body \"...\""]);

  if (typeof parsed.flags.body === "string") return addComment(id, parsed.flags.body);
  return listComments(id);
}

async function addComment(id: string, body: string): Promise<number> {
  if (body.trim().length === 0) {
    throw usageError("--body cannot be empty", ['linear-axi issue comment <id> --body "..."']);
  }
  const ref = await resolveIssueRef(id);
  const data = await gql<{ commentCreate: { success: boolean; comment: { id: string } | null } }>(
    `mutation($input:CommentCreateInput!){ commentCreate(input:$input){ success comment{ id } } }`,
    { input: { issueId: ref.uuid, body } },
  );
  if (!data.commentCreate.success) {
    throw usageError("comment failed", ["Check the issue id and retry"]);
  }
  print({ commented: { issue: ref.identifier } }, [
    `Run \`linear-axi issue comment ${ref.identifier}\` to see all comments`,
  ]);
  return 0;
}

interface CommentNode {
  body: string;
  createdAt: string;
  user: { displayName: string } | null;
}

async function listComments(id: string): Promise<number> {
  const data = await gql<{ issue: { identifier: string; comments: { nodes: CommentNode[] } } | null }>(
    `query($id:String!){ issue(id:$id){ identifier comments{ nodes{ body createdAt user{ displayName } } } } }`,
    { id },
  );
  if (!data.issue) {
    printLine(`issue: ${id} not found`, ["Run `linear-axi issue list` to see available issues"]);
    return 1;
  }
  const nodes = data.issue.comments.nodes;
  if (nodes.length === 0) {
    printLine(`comments: 0 comments on ${data.issue.identifier}`, [
      `Run \`linear-axi issue comment ${data.issue.identifier} --body "..."\` to add one`,
    ]);
    return 0;
  }

  print(
    {
      count: nodes.length,
      comments: nodes.map((c) => ({
        author: c.user?.displayName ?? "-",
        when: c.createdAt.slice(0, 10),
        body: truncate(c.body, 200).text.replace(/\s*\n\s*/g, " "),
      })),
    },
    [`Run \`linear-axi issue comment ${data.issue.identifier} --body "..."\` to add a comment`],
  );
  return 0;
}
