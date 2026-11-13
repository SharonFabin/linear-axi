/**
 * Resolvers that turn human-friendly inputs (identifiers, names, keywords) into
 * the ids the Linear API needs. Kept separate from command logic so create /
 * update / comment share one source of truth.
 */
import { gql } from "./client.js";
import { AxiError } from "../lib/errors.js";

export const PRIORITY_LABELS = ["No priority", "Urgent", "High", "Medium", "Low"];
const PRIORITY_MAP: Record<string, number> = {
  none: 0,
  "no priority": 0,
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export function priorityToNumber(label: string): number {
  const n = PRIORITY_MAP[label.toLowerCase()];
  if (n === undefined) {
    throw new AxiError(`invalid priority "${label}"`, {
      exitCode: 2,
      help: ["valid: none, urgent, high, medium, low"],
    });
  }
  return n;
}

export interface IssueRef {
  uuid: string;
  identifier: string;
  title: string;
  priority: number;
  team: { id: string; key: string };
  state: { name: string } | null;
  assignee: { id: string; displayName: string } | null;
  labels: { id: string; name: string }[];
}

interface RawIssueRef {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  team: { id: string; key: string };
  state: { name: string } | null;
  assignee: { id: string; displayName: string } | null;
  labels: { nodes: { id: string; name: string }[] };
}

/** Fetch an issue's current state so mutations can be idempotent (principle #6). */
export async function resolveIssueRef(identifier: string): Promise<IssueRef> {
  const data = await gql<{ issue: RawIssueRef | null }>(
    `query($id:String!){
      issue(id:$id){
        id identifier title priority
        team{ id key }
        state{ name }
        assignee{ id displayName }
        labels{ nodes{ id name } }
      }
    }`,
    { id: identifier },
  );
  const raw = data.issue;
  if (!raw) {
    throw new AxiError(`issue ${identifier} not found`, {
      exitCode: 1,
      help: ["Run `linear-axi issue list` to see available issues"],
    });
  }
  // GraphQL returns `id` (uuid); we expose it as `uuid` for clarity.
  return {
    uuid: raw.id,
    identifier: raw.identifier,
    title: raw.title,
    priority: raw.priority,
    team: raw.team,
    state: raw.state,
    assignee: raw.assignee,
    labels: raw.labels.nodes,
  };
}

/** Resolve a workflow state by name or category keyword within a team. */
export async function resolveStateId(
  teamId: string,
  wanted: string,
): Promise<{ id: string; name: string }> {
  const data = await gql<{ team: { states: { nodes: { id: string; name: string; type: string }[] } } }>(
    `query($id:String!){ team(id:$id){ states{ nodes{ id name type } } } }`,
    { id: teamId },
  );
  const states = data.team.states.nodes;
  const needle = wanted.toLowerCase();

  const byName = states.find((s) => s.name.toLowerCase() === needle);
  if (byName) return { id: byName.id, name: byName.name };

  const typeAlias: Record<string, string> = {
    done: "completed",
    completed: "completed",
    canceled: "canceled",
    cancelled: "canceled",
    todo: "unstarted",
    backlog: "backlog",
    started: "started",
    "in progress": "started",
  };
  const type = typeAlias[needle];
  const byType = type ? states.find((s) => s.type === type) : undefined;
  if (byType) return { id: byType.id, name: byType.name };

  throw new AxiError(`state "${wanted}" not found in team`, {
    exitCode: 2,
    help: [`available states: ${states.map((s) => s.name).join(", ")}`],
  });
}

/** Resolve an assignee: "@me"/"me" -> viewer, "none"/"unassigned" -> null, else by name/email. */
export async function resolveAssigneeId(value: string): Promise<string | null> {
  const v = value.toLowerCase();
  if (v === "@me" || v === "me") {
    const data = await gql<{ viewer: { id: string } }>(`query{ viewer{ id } }`, {});
    return data.viewer.id;
  }
  if (v === "none" || v === "unassigned") return null;

  const data = await gql<{ users: { nodes: { id: string; displayName: string; email: string }[] } }>(
    `query($q:String!){ users(filter:{ or:[{displayName:{containsIgnoreCase:$q}},{email:{containsIgnoreCase:$q}}] }){ nodes{ id displayName email } } }`,
    { q: value },
  );
  const first = data.users.nodes[0];
  if (!first) {
    throw new AxiError(`no user matching "${value}"`, {
      exitCode: 2,
      help: ["Use --assignee @me, a name/email, or none"],
    });
  }
  return first.id;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the string is a Linear UUID (vs a human name), for id-vs-name filters. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function splitList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
