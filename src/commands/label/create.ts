/**
 * `linear-axi label create --name ...` - create a team or workspace label.
 * Idempotent: a label with the same name in the same scope is a no-op.
 */
import { gql, getClient } from "../../linear/client.js";
import { resolveTeamScope } from "../../lib/context.js";
import { parseArgs, requireString, type FlagSchema } from "../../lib/args.js";
import { AxiError, usageError } from "../../lib/errors.js";
import { print, printLine } from "../../output/toon.js";
import { fetchLabels, normalizeColor, pickLabel, scopeOf, type LabelNode } from "../../linear/labels.js";

const SCHEMA: FlagSchema = {
  name: { type: "string", description: "label name (required)" },
  color: { type: "string", description: "hex color, e.g. #5e6ad2" },
  description: { type: "string", description: "label description" },
  team: { type: "string", description: "team key or name (default: LINEAR_AXI_DEFAULT_TEAM)" },
  workspace: { type: "boolean", description: "create a workspace label instead of a team label" },
  parent: { type: "string", description: "group label (name or id) to nest under" },
};

const HELP = `linear-axi label create - create a label

Required:
  --name "..."

Flags:
  --color "#RRGGBB"      hex color
  --description "..."    label description
  --team <key>           team key or name (default: LINEAR_AXI_DEFAULT_TEAM)
  --workspace            create a workspace label (no team)
  --parent <group>       group label (name or id) to nest under

Examples:
  linear-axi label create --name Bug --color "#eb5757" --team MYT
  linear-axi label create --name "P1" --parent Priority --team MYT
  linear-axi label create --name Customer --workspace`;

export async function labelCreate(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "label create");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const name = requireString(parsed, "name", "label create", 'linear-axi label create --name "..." --team <key>');
  const color = typeof parsed.flags.color === "string" ? normalizeColor(parsed.flags.color) : undefined;

  let team: { id: string; key: string } | undefined;
  if (parsed.flags.workspace) {
    if (parsed.flags.team) throw usageError("--workspace and --team cannot be combined");
  } else {
    const scope = await resolveTeamScope(getClient(), parsed.flags.team as string | undefined);
    if (!scope.team) {
      throw usageError("a team is required to create a team label", [
        "Pass --team <key>, set LINEAR_AXI_DEFAULT_TEAM, or use --workspace",
      ]);
    }
    team = scope.team;
  }

  const labels = await fetchLabels(team?.id);
  const sameScope = (l: LabelNode) => (l.team?.id ?? null) === (team?.id ?? null);
  const existing = labels.find((l) => sameScope(l) && l.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    printLine(`${existing.name}: no changes (label already exists in ${scopeOf(existing)}, id ${existing.id})`);
    return 0;
  }

  const input: Record<string, unknown> = { name };
  if (team) input.teamId = team.id;
  if (color) input.color = color;
  if (typeof parsed.flags.description === "string") input.description = parsed.flags.description;
  if (typeof parsed.flags.parent === "string") {
    const parent = pickLabel(labels.filter(sameScope), parsed.flags.parent);
    input.parentId = parent.id;
  }

  const data = await gql<{ issueLabelCreate: { success: boolean; issueLabel: LabelNode | null } }>(
    `mutation($input:IssueLabelCreateInput!){
      issueLabelCreate(input:$input){ success issueLabel{ id name color parent{ name } team{ key } } }
    }`,
    { input },
  );
  const l = data.issueLabelCreate.issueLabel;
  if (!data.issueLabelCreate.success || !l) {
    throw new AxiError("label creation failed", { help: ["Check the name, color and parent, then retry"] });
  }
  print(
    { created: { id: l.id, name: l.name, team: scopeOf(l), group: l.parent?.name ?? "-", color: l.color } },
    [`Run \`linear-axi issue update <id> --add-label "${l.name}"\` to tag an issue`],
  );
  return 0;
}
