/**
 * `linear-axi issue view <id> [--full]` - detail view.
 * Truncates the description by default with a size hint (principle #3),
 * includes cheap derived counts (comments, sub-issues) (principle #4).
 */
import { gql } from "../../linear/client.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { usageError } from "../../lib/errors.js";
import { toon, printLine, printRaw, renderHelp } from "../../output/toon.js";
import { truncate } from "../../lib/truncate.js";

const SCHEMA: FlagSchema = {
  full: { type: "boolean", description: "show the complete description instead of a preview" },
};

const HELP = `linear-axi issue view <id> - show one issue in detail

Arguments:
  <id>         issue identifier, e.g. MYT-42

Flags:
  --full       print the complete description (default: truncated preview)

Examples:
  linear-axi issue view MYT-42
  linear-axi issue view MYT-42 --full`;

interface IssueDetail {
  identifier: string;
  title: string;
  description: string | null;
  priorityLabel: string;
  url: string;
  updatedAt: string;
  state: { name: string } | null;
  assignee: { displayName: string } | null;
  team: { key: string } | null;
  project: { name: string } | null;
  projectMilestone: { name: string } | null;
  labels: { nodes: { name: string }[] };
  comments: { nodes: { id: string }[] };
  children: { nodes: { identifier: string }[] };
  parent: { identifier: string } | null;
}

export async function issueView(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "issue view");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const id = parsed.positionals[0];
  if (!id) {
    throw usageError("issue id is required", ["linear-axi issue view <id>"]);
  }

  const data = await gql<{ issue: IssueDetail | null }>(VIEW_QUERY, { id });
  const issue = data.issue;
  if (!issue) {
    printLine(`issue: ${id} not found`, ["Run `linear-axi issue list` to see available issues"]);
    return 1;
  }

  const labels = issue.labels.nodes.map((l) => l.name);
  const meta: Record<string, unknown> = {
    id: issue.identifier,
    title: issue.title,
    state: issue.state?.name ?? "-",
    assignee: issue.assignee?.displayName ?? "-",
    priority: issue.priorityLabel,
    team: issue.team?.key ?? "-",
    project: issue.project?.name ?? "-",
    milestone: issue.projectMilestone?.name ?? "-",
    labels: labels.length > 0 ? labels.join(", ") : "-",
    comments: issue.comments.nodes.length,
    "sub-issues": issue.children.nodes.length,
    parent: issue.parent?.identifier ?? "-",
    updated: issue.updatedAt.slice(0, 10),
    url: issue.url,
  };

  // Metadata via TOON; description as a raw block to avoid \n escaping.
  let out = toon({ issue: meta });

  const full = parsed.flags.full === true;
  const body = issue.description ?? "";
  if (body.length === 0) {
    out += "\ndescription: (empty)";
  } else if (full) {
    out += "\ndescription:\n" + indent(body);
  } else {
    const t = truncate(body);
    out += "\ndescription:\n" + indent(t.text);
    if (t.truncated) {
      out += `\n  ... (truncated, ${t.totalChars} chars total)`;
      out += "\n" + renderHelp([`Run \`linear-axi issue view ${issue.identifier} --full\` for the complete description`]);
    }
  }

  printRaw(out);
  return 0;
}

const VIEW_QUERY = `query($id:String!){
  issue(id:$id){
    identifier title description priorityLabel url updatedAt
    state{ name } assignee{ displayName } team{ key }
    project{ name } projectMilestone{ name }
    labels{ nodes{ name } }
    comments{ nodes{ id } }
    children{ nodes{ identifier } }
    parent{ identifier }
  }
}`;

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => "  " + line)
    .join("\n");
}
