/**
 * Label lookup shared by `label *` commands and the --label / --add-label /
 * --remove-label flags on issues. Linear has team labels (team set) and
 * workspace labels (team null); both can be applied to a team's issues.
 */
import { gql } from "./client.js";
import { AxiError, usageError } from "../lib/errors.js";
import { isUuid } from "./resolve.js";

export interface LabelNode {
  id: string;
  name: string;
  color: string;
  description: string | null;
  isGroup: boolean;
  parent: { id: string; name: string } | null;
  team: { id: string; key: string } | null;
}

const LABEL_FIELDS = `id name color description isGroup parent{ id name } team{ id key }`;

/**
 * Fetch labels. With `teamId`: that team's labels plus workspace labels.
 * Without: every label the key can see.
 */
export async function fetchLabels(teamId?: string): Promise<LabelNode[]> {
  const filter = teamId
    ? { or: [{ team: { id: { eq: teamId } } }, { team: { null: true } }] }
    : undefined;
  const out: LabelNode[] = [];
  let after: string | null = null;
  for (;;) {
    const data: { issueLabels: { nodes: LabelNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } =
      await gql(
        `query($after:String, $filter:IssueLabelFilter){
          issueLabels(first:250, after:$after, filter:$filter){
            pageInfo{ hasNextPage endCursor }
            nodes{ ${LABEL_FIELDS} }
          }
        }`,
        { after, filter },
      );
    out.push(...data.issueLabels.nodes);
    if (!data.issueLabels.pageInfo.hasNextPage) return out;
    after = data.issueLabels.pageInfo.endCursor;
  }
}

export function scopeOf(l: Pick<LabelNode, "team">): string {
  return l.team?.key ?? "workspace";
}

/** Match by exact id or case-insensitive name. */
function matches(l: LabelNode, ref: string): boolean {
  return isUuid(ref) ? l.id.toLowerCase() === ref.trim().toLowerCase() : l.name.toLowerCase() === ref.toLowerCase();
}

/**
 * Find one label by name or id. A name that matches several labels (same name
 * in different teams) is an error listing the candidates, unless `preferTeamId`
 * picks a team label over a workspace one.
 */
export function pickLabel(labels: LabelNode[], ref: string, opts: { preferTeamId?: string } = {}): LabelNode {
  const found = labels.filter((l) => matches(l, ref));
  if (found.length === 0) {
    throw new AxiError(`label "${ref}" not found`, {
      exitCode: 2,
      help: ["Run `linear-axi label list --all` to see available labels"],
    });
  }
  if (found.length === 1) return found[0]!;
  const preferred = opts.preferTeamId ? found.filter((l) => l.team?.id === opts.preferTeamId) : [];
  if (preferred.length === 1) return preferred[0]!;
  throw new AxiError(`label "${ref}" is ambiguous (${found.length} matches)`, {
    exitCode: 2,
    help: [
      ...found.map((l) => `${l.name} [${scopeOf(l)}] id=${l.id}`),
      "Pass --team <key> or the label id to pick one",
    ],
  });
}

/** Resolve names for an issue in `teamId`: team label first, then workspace. Unknown names are a usage error. */
export async function resolveLabelIds(teamId: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  return resolveFrom(await fetchLabels(teamId), teamId, names);
}

function resolveFrom(labels: LabelNode[], teamId: string, names: string[]): string[] {
  return names.map((name) => {
    const found = labels.filter((l) => l.name.toLowerCase() === name.toLowerCase());
    const inTeam = found.filter((l) => l.team?.id === teamId);
    const pool = inTeam.length > 0 ? inTeam : found;
    if (pool.length > 1) {
      throw new AxiError(`label "${name}" is ambiguous (${pool.length} matches)`, {
        exitCode: 2,
        help: pool.map((l) => `${l.name} [${scopeOf(l)}] parent=${l.parent?.name ?? "-"} id=${l.id}`),
      });
    }
    const match = pool[0];
    if (!match) {
      throw new AxiError(`label "${name}" not found in team`, {
        exitCode: 2,
        help: [`available labels: ${labels.map((l) => l.name).join(", ") || "(none)"}`],
      });
    }
    return match.id;
  });
}

/** Resolve --add-label / --remove-label together (one fetch). */
export async function resolveLabelOps(
  teamId: string,
  add: string[],
  remove: string[],
): Promise<{ addIds: string[]; removeIds: string[] }> {
  if (add.length + remove.length === 0) return { addIds: [], removeIds: [] };
  const labels = await fetchLabels(teamId);
  return { addIds: resolveFrom(labels, teamId, add), removeIds: resolveFrom(labels, teamId, remove) };
}

/** Usage checks shared by issue create/update. Returns the parsed lists. */
export function parseLabelFlags(
  flags: Record<string, string | boolean>,
  splitList: (raw?: string) => string[],
): { replace?: string[]; add: string[]; remove: string[] } {
  const add = splitList(flags["add-label"] as string | undefined);
  const remove = splitList(flags["remove-label"] as string | undefined);
  const hasReplace = typeof flags.label === "string";
  if (hasReplace && (add.length > 0 || remove.length > 0)) {
    throw usageError("--label replaces all labels and cannot be combined with --add-label/--remove-label", [
      "Use --label a,b to set the exact list, or --add-label/--remove-label to change a few",
    ]);
  }
  const overlap = add.find((a) => remove.some((r) => r.toLowerCase() === a.toLowerCase()));
  if (overlap) throw usageError(`label "${overlap}" is in both --add-label and --remove-label`);
  return { replace: hasReplace ? splitList(flags.label as string) : undefined, add, remove };
}

/** Accept `#abc123` or `abc123`; Linear wants `#RRGGBB`. */
export function normalizeColor(raw: string): string {
  const c = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-f]{6}$/i.test(c)) {
    throw usageError(`invalid color "${raw}"`, ['use a hex color like "#5e6ad2"']);
  }
  return c.toLowerCase();
}
