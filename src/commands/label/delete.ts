/**
 * `linear-axi label delete <name|id> --yes` - delete a label. Destructive (it is
 * removed from every issue), so it needs --yes; without it nothing is deleted.
 */
import { gql, getClient } from "../../linear/client.js";
import { resolveTeamScope } from "../../lib/context.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { AxiError, usageError } from "../../lib/errors.js";
import { print, printLine } from "../../output/toon.js";
import { fetchLabels, pickLabel, scopeOf } from "../../linear/labels.js";

const SCHEMA: FlagSchema = {
  yes: { type: "boolean", description: "confirm the deletion" },
  team: { type: "string", description: "team key or name, to disambiguate a name used in several teams" },
};

const HELP = `linear-axi label delete <name|id> - delete a label (needs --yes)

Arguments:
  <name|id>    label name or id

Flags:
  --yes          confirm; without it nothing is deleted
  --team <key>   disambiguate a name that exists in several teams

Examples:
  linear-axi label delete Bug --team MYT --yes`;

export async function labelDelete(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "label delete");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }
  const [ref] = parsed.positionals;
  if (!ref || parsed.positionals.length > 1) {
    throw usageError("exactly one label name or id is required", ["linear-axi label delete <name|id> --yes"]);
  }

  const teamId = typeof parsed.flags.team === "string" ? (await resolveTeamScope(getClient(), parsed.flags.team)).team?.id : undefined;
  const all = await fetchLabels(teamId);
  const label = pickLabel(teamId ? all.filter((l) => l.team?.id === teamId) : all, ref);

  if (!parsed.flags.yes) {
    throw usageError(`deleting label "${label.name}" [${scopeOf(label)}] removes it from every issue; pass --yes to confirm`, [
      `linear-axi label delete ${label.id} --yes`,
    ]);
  }

  const data = await gql<{ issueLabelDelete: { success: boolean } }>(
    `mutation($id:String!){ issueLabelDelete(id:$id){ success } }`,
    { id: label.id },
  );
  if (!data.issueLabelDelete.success) {
    throw new AxiError("label delete failed", { help: ["Check the label id, then retry"] });
  }
  print({ deleted: { id: label.id, name: label.name, team: scopeOf(label) } }, ["Run `linear-axi label list` to confirm"]);
  return 0;
}
