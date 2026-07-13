/** Direct Linear access for seeding fixtures and verifying task outcomes. */
import { LinearClient } from "@linear/sdk";
import { CONFIG } from "../config.js";

const client = new LinearClient({ apiKey: CONFIG.apiKey });

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await client.client.rawRequest(query, variables);
  return res.data as T;
}

let viewerIdCache: string | undefined;
export async function viewerId(): Promise<string> {
  if (viewerIdCache) return viewerIdCache;
  const data = await gql<{ viewer: { id: string } }>(`query{ viewer{ id } }`);
  viewerIdCache = data.viewer.id;
  return viewerIdCache;
}

let teamIdCache: string | undefined;
export async function teamId(): Promise<string> {
  if (teamIdCache) return teamIdCache;
  const data = await gql<{ teams: { nodes: { id: string; key: string; name: string }[] } }>(
    `query{ teams(first:250){ nodes{ id key name } } }`,
  );
  const needle = CONFIG.teamKey.toLowerCase();
  const t = data.teams.nodes.find(
    (n) => n.key.toLowerCase() === needle || n.name.toLowerCase() === needle,
  );
  if (!t) throw new Error(`bench team ${CONFIG.teamKey} not found`);
  teamIdCache = t.id;
  return t.id;
}

export interface IssueSnapshot {
  identifier: string;
  title: string;
  state: string | null;
  stateType: string | null;
  assignee: string | null;
  priority: number;
  labels: string[];
  commentCount: number;
  parent: string | null;
}

const ISSUE_FIELDS = `identifier title priority state{name type} assignee{displayName} labels{nodes{name}} comments{nodes{id}} parent{identifier}`;

export async function getIssue(identifier: string): Promise<IssueSnapshot | null> {
  const data = await gql<{ issue: RawIssue | null }>(
    `query($id:String!){ issue(id:$id){ ${ISSUE_FIELDS} } }`,
    { id: identifier },
  );
  return data.issue ? snap(data.issue) : null;
}

export async function findIssuesByTitle(contains: string): Promise<IssueSnapshot[]> {
  const tid = await teamId();
  const data = await gql<{ issues: { nodes: RawIssue[] } }>(
    `query($tid:ID!,$q:String!){ issues(first:100, filter:{ team:{id:{eq:$tid}}, title:{containsIgnoreCase:$q} }){ nodes{ ${ISSUE_FIELDS} } } }`,
    { tid, q: contains },
  );
  return data.issues.nodes.map(snap);
}

export async function countOpen(): Promise<number> {
  const tid = await teamId();
  const data = await gql<{ issues: { nodes: { id: string }[] } }>(
    `query($tid:ID!){ issues(first:250, filter:{ team:{id:{eq:$tid}}, state:{type:{nin:["completed","canceled"]}} }){ nodes{ id } } }`,
    { tid },
  );
  return data.issues.nodes.length;
}

export async function createIssue(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const tid = await teamId();
  const data = await gql<{ issueCreate: { issue: { identifier: string } } }>(
    `mutation($i:IssueCreateInput!){ issueCreate(input:$i){ issue{ identifier } } }`,
    { i: { teamId: tid, title, ...extra } },
  );
  return data.issueCreate.issue.identifier;
}

/** Archive every issue in the bench team whose title starts with the given prefix. */
export async function archiveByPrefix(prefix: string): Promise<number> {
  const tid = await teamId();
  const data = await gql<{ issues: { nodes: { id: string; title: string }[] } }>(
    `query($tid:ID!){ issues(first:250, filter:{ team:{id:{eq:$tid}} }){ nodes{ id title } } }`,
    { tid },
  );
  const targets = data.issues.nodes.filter((n) => n.title.startsWith(prefix));
  for (const t of targets) {
    await gql(`mutation($id:String!){ issueArchive(id:$id){ success } }`, { id: t.id });
  }
  return targets.length;
}

interface RawIssue {
  identifier: string;
  title: string;
  priority: number;
  state: { name: string; type: string } | null;
  assignee: { displayName: string } | null;
  labels: { nodes: { name: string }[] };
  comments: { nodes: { id: string }[] };
  parent: { identifier: string } | null;
}

function snap(i: RawIssue): IssueSnapshot {
  return {
    identifier: i.identifier,
    title: i.title,
    state: i.state?.name ?? null,
    stateType: i.state?.type ?? null,
    assignee: i.assignee?.displayName ?? null,
    priority: i.priority,
    labels: i.labels.nodes.map((l) => l.name),
    commentCount: i.comments.nodes.length,
    parent: i.parent?.identifier ?? null,
  };
}
