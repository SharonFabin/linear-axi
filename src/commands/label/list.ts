/**
 * `linear-axi label list` - team and workspace labels, with group (parent) and color.
 * Defaults to the default team's labels plus workspace labels; --all lists every team.
 */
import { getClient } from "../../linear/client.js";
import { resolveTeamScope } from "../../lib/context.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { print, printLine, type Help } from "../../output/toon.js";
import { fetchLabels, scopeOf } from "../../linear/labels.js";

const SCHEMA: FlagSchema = {
  team: { type: "string", description: "team key or name (default: LINEAR_AXI_DEFAULT_TEAM)" },
  all: { type: "boolean", description: "list labels of every team" },
};

const HELP = `linear-axi label list - list labels (team + workspace)

Flags:
  --team <key>   team key or name (default: LINEAR_AXI_DEFAULT_TEAM)
  --all          every team's labels plus workspace labels

Examples:
  linear-axi label list
  linear-axi label list --team MYT
  linear-axi label list --all`;

export async function labelList(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "label list");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const scope = parsed.flags.all ? {} : await resolveTeamScope(getClient(), parsed.flags.team as string | undefined);
  const labels = await fetchLabels(scope.team?.id);
  const label = scope.team ? `labels in ${scope.team.key} + workspace` : "labels";

  if (labels.length === 0) {
    printLine(`${label}: 0 labels found`, ["Run `linear-axi label create --name <n> --color \"#RRGGBB\"` to add one"]);
    return 0;
  }

  const rows = labels
    .sort((a, b) => scopeOf(a).localeCompare(scopeOf(b)) || a.name.localeCompare(b.name))
    .map((l) => ({
      name: l.name,
      team: scopeOf(l),
      group: l.parent?.name ?? (l.isGroup ? "(group)" : "-"),
      color: l.color,
      id: l.id,
    }));

  const body: Record<string, unknown> = { count: rows.length, labels: rows };
  if (scope.note) body.note = scope.note;
  const help: Help = [
    "Run `linear-axi label update <name|id> --color \"#RRGGBB\"` to change one",
    "Run `linear-axi issue update <id> --add-label <name>` to tag an issue",
  ];
  if (!parsed.flags.all) help.push("Run `linear-axi label list --all` for every team's labels");
  print(body, help);
  return 0;
}
