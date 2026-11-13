/**
 * `linear-axi label update <name|id>` - rename, recolor, redescribe or move a label
 * into a group. Idempotent: only differing fields are sent.
 */
import { gql, getClient } from "../../linear/client.js";
import { resolveTeamScope } from "../../lib/context.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { AxiError, usageError } from "../../lib/errors.js";
import { print, printLine } from "../../output/toon.js";
import { fetchLabels, normalizeColor, pickLabel, scopeOf, type LabelNode } from "../../linear/labels.js";

const SCHEMA: FlagSchema = {
  name: { type: "string", description: "new name" },
  color: { type: "string", description: "hex color, e.g. #5e6ad2" },
  description: { type: "string", description: "new description" },
  parent: { type: "string", description: "group label (name or id) to nest under, or none" },
  team: { type: "string", description: "team key or name, to disambiguate a name used in several teams" },
};

const HELP = `linear-axi label update <name|id> - change a label (idempotent)

Arguments:
  <name|id>    label name or id

Flags:
  --name "..."          rename
  --color "#RRGGBB"     recolor
  --description "..."   new description
  --parent <group>      move into a group label (name or id), or none to move out
  --team <key>          disambiguate a name that exists in several teams

Examples:
  linear-axi label update Bug --color "#eb5757"
  linear-axi label update Bug --name Defect --team MYT
  linear-axi label update P1 --parent Priority --team MYT`;

export async function labelUpdate(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "label update");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }
  const [ref] = parsed.positionals;
  if (!ref || parsed.positionals.length > 1) {
    throw usageError("exactly one label name or id is required", ['linear-axi label update <name|id> --color "#RRGGBB"']);
  }
  const f = parsed.flags;
  if (!["name", "color", "description", "parent"].some((k) => typeof f[k] === "string")) {
    throw usageError("nothing to update - pass at least one field", [`linear-axi label update ${ref} --color "#RRGGBB"`]);
  }

  const teamId = typeof f.team === "string" ? (await resolveTeamScope(getClient(), f.team)).team?.id : undefined;
  const all = await fetchLabels(teamId);
  const label = pickLabel(teamId ? all.filter((l) => l.team?.id === teamId) : all, ref);

  const input: Record<string, unknown> = {};
  const changes: string[] = [];
  if (typeof f.name === "string" && f.name !== label.name) {
    input.name = f.name;
    changes.push(`name -> ${f.name}`);
  }
  if (typeof f.color === "string") {
    const color = normalizeColor(f.color);
    if (color.toLowerCase() !== label.color.toLowerCase()) {
      input.color = color;
      changes.push(`color -> ${color}`);
    }
  }
  if (typeof f.description === "string" && f.description !== (label.description ?? "")) {
    input.description = f.description;
    changes.push("description");
  }
  if (typeof f.parent === "string") {
    if (f.parent.toLowerCase() === "none") {
      if (label.parent) {
        input.parentId = null;
        changes.push("group -> none");
      }
    } else {
      const sameScope = (l: LabelNode) => (l.team?.id ?? null) === (label.team?.id ?? null);
      const parent = pickLabel(all.filter(sameScope), f.parent);
      if (parent.id === label.id) throw usageError("a label cannot be its own parent");
      if (parent.id !== label.parent?.id) {
        input.parentId = parent.id;
        changes.push(`group -> ${parent.name}`);
      }
    }
  }

  if (changes.length === 0) {
    printLine(`${label.name}: no changes (already up to date)`);
    return 0;
  }

  const data = await gql<{ issueLabelUpdate: { success: boolean; issueLabel: LabelNode | null } }>(
    `mutation($id:String!, $input:IssueLabelUpdateInput!){
      issueLabelUpdate(id:$id, input:$input){ success issueLabel{ id name color parent{ name } team{ key } } }
    }`,
    { id: label.id, input },
  );
  const l = data.issueLabelUpdate.issueLabel;
  if (!data.issueLabelUpdate.success || !l) {
    throw new AxiError("label update failed", { help: ["Check the field values, then retry"] });
  }
  print({
    updated: { id: l.id, name: l.name, team: scopeOf(l), group: l.parent?.name ?? "-", color: l.color, changed: changes.join(", ") },
  });
  return 0;
}
