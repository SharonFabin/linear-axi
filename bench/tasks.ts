/**
 * Benchmark tasks. Each is verified programmatically against Linear state (and
 * the agent's final answer) rather than via an LLM judge, for cheap determinism.
 * Every run gets a unique `tag` so parallel conditions never collide in the
 * shared team; all bench issues start with "BENCH " for one-shot cleanup.
 */
import {
  countOpen,
  createIssue,
  findIssuesByTitle,
  getIssue,
  viewerId,
} from "./lib/linear.js";

export interface TaskCtx {
  tag: string;
}

export interface Verdict {
  pass: boolean;
  detail: string;
}

export interface Task {
  id: string;
  kind: "read" | "write";
  makePrompt: (ctx: TaskCtx) => string;
  seed?: (ctx: TaskCtx) => Promise<void>;
  verify: (ctx: TaskCtx, answer: string) => Promise<Verdict>;
}

const containsCI = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase());
const numbersIn = (s: string) => (s.match(/\d+/g) ?? []).map((n) => Number.parseInt(n, 10));

export const TASKS: Task[] = [
  {
    id: "read-count-open",
    kind: "read",
    makePrompt: () =>
      "How many open issues (not Done and not Canceled) are in the default team? Answer with just the number.",
    verify: async (_ctx, answer) => {
      const truth = await countOpen();
      const pass = numbersIn(answer).includes(truth);
      return { pass, detail: `truth=${truth}, answer="${answer.slice(0, 80)}"` };
    },
  },
  {
    id: "read-find-by-keyword",
    kind: "read",
    seed: async ({ tag }) => {
      await createIssue(`BENCH SEED ${tag} oauth refresh bug`, { stateId: undefined });
    },
    makePrompt: ({ tag }) =>
      `Find the issue whose title contains "${tag} oauth refresh". Report its identifier and its current status.`,
    verify: async ({ tag }, answer) => {
      const found = await findIssuesByTitle(`${tag} oauth refresh`);
      const issue = found[0];
      if (!issue) return { pass: false, detail: "seed issue missing" };
      const pass = containsCI(answer, issue.identifier);
      return { pass, detail: `expected ${issue.identifier} in answer` };
    },
  },
  {
    id: "read-list-assigned",
    kind: "read",
    seed: async ({ tag }) => {
      await createIssue(`BENCH SEED ${tag} my assigned task`, { assigneeId: await viewerId() });
    },
    makePrompt: ({ tag }) =>
      `List issues assigned to me whose title contains "${tag}". Report their identifiers.`,
    verify: async ({ tag }, answer) => {
      const found = await findIssuesByTitle(`${tag} my assigned`);
      const issue = found[0];
      if (!issue) return { pass: false, detail: "seed issue missing" };
      return { pass: containsCI(answer, issue.identifier), detail: `expected ${issue.identifier}` };
    },
  },
  {
    id: "write-create-priority",
    kind: "write",
    makePrompt: ({ tag }) =>
      `Create a new issue titled "BENCH CREATE ${tag}" with priority High in the default team.`,
    verify: async ({ tag }) => {
      const found = await findIssuesByTitle(`BENCH CREATE ${tag}`);
      const issue = found[0];
      if (!issue) return { pass: false, detail: "issue not created" };
      return { pass: issue.priority === 2, detail: `priority=${issue.priority} (want 2=High)` };
    },
  },
  {
    id: "write-update-state",
    kind: "write",
    seed: async ({ tag }) => {
      await createIssue(`BENCH UPDATE ${tag}`);
    },
    makePrompt: ({ tag }) => `Mark the issue titled "BENCH UPDATE ${tag}" as Done.`,
    verify: async ({ tag }) => {
      const found = await findIssuesByTitle(`BENCH UPDATE ${tag}`);
      const issue = found[0];
      if (!issue) return { pass: false, detail: "issue missing" };
      const fresh = await getIssue(issue.identifier);
      return { pass: fresh?.stateType === "completed", detail: `state=${fresh?.state}` };
    },
  },
  {
    id: "write-comment",
    kind: "write",
    seed: async ({ tag }) => {
      await createIssue(`BENCH COMMENT ${tag}`);
    },
    makePrompt: ({ tag }) => `Add a comment "looks good to me" to the issue titled "BENCH COMMENT ${tag}".`,
    verify: async ({ tag }) => {
      const found = await findIssuesByTitle(`BENCH COMMENT ${tag}`);
      const issue = found[0];
      if (!issue) return { pass: false, detail: "issue missing" };
      const fresh = await getIssue(issue.identifier);
      return { pass: (fresh?.commentCount ?? 0) >= 1, detail: `comments=${fresh?.commentCount}` };
    },
  },

  // ---- harder tasks: multi-step, filter+iterate, priority, relationships ----

  {
    id: "write-multistep-flow",
    kind: "write",
    seed: async ({ tag }) => {
      await createIssue(`BENCH FLOW ${tag}`);
    },
    makePrompt: ({ tag }) =>
      `For the issue titled "BENCH FLOW ${tag}": set its status to In Progress, assign it to me, and add a comment "work started". Do all three.`,
    verify: async ({ tag }) => {
      const issue = (await findIssuesByTitle(`BENCH FLOW ${tag}`))[0];
      if (!issue) return { pass: false, detail: "issue missing" };
      const f = await getIssue(issue.identifier);
      const pass = f?.stateType === "started" && f?.assignee != null && (f?.commentCount ?? 0) >= 1;
      return { pass, detail: `state=${f?.state}, assignee=${f?.assignee}, comments=${f?.commentCount}` };
    },
  },
  {
    id: "write-triage-unassigned",
    kind: "write",
    seed: async ({ tag }) => {
      await createIssue(`BENCH TRIAGE ${tag} one`);
      await createIssue(`BENCH TRIAGE ${tag} two`);
    },
    makePrompt: ({ tag }) =>
      `Find every unassigned open issue whose title contains "BENCH TRIAGE ${tag}" and assign each of them to me.`,
    verify: async ({ tag }) => {
      const found = await findIssuesByTitle(`BENCH TRIAGE ${tag}`);
      const assigned = found.filter((i) => i.assignee != null).length;
      return { pass: found.length >= 2 && assigned === found.length, detail: `${assigned}/${found.length} assigned` };
    },
  },
  {
    id: "read-highest-priority",
    kind: "read",
    seed: async ({ tag }) => {
      await createIssue(`BENCH PRIO ${tag} low`, { priority: 4 });
      await createIssue(`BENCH PRIO ${tag} urgent`, { priority: 1 });
      await createIssue(`BENCH PRIO ${tag} medium`, { priority: 3 });
    },
    makePrompt: ({ tag }) =>
      `Among issues whose title contains "BENCH PRIO ${tag}", which one has the highest priority? Report its identifier.`,
    verify: async ({ tag }, answer) => {
      const found = await findIssuesByTitle(`BENCH PRIO ${tag}`);
      const urgent = found.find((i) => i.priority === 1);
      if (!urgent) return { pass: false, detail: "seed incomplete" };
      return { pass: containsCI(answer, urgent.identifier), detail: `expected ${urgent.identifier} (Urgent)` };
    },
  },
  {
    id: "write-subissue",
    kind: "write",
    seed: async ({ tag }) => {
      await createIssue(`BENCH PARENT ${tag}`);
    },
    makePrompt: ({ tag }) =>
      `Create a sub-issue of the issue titled "BENCH PARENT ${tag}". The new sub-issue's title must be "BENCH CHILD ${tag}".`,
    verify: async ({ tag }) => {
      const parent = (await findIssuesByTitle(`BENCH PARENT ${tag}`))[0];
      const child = (await findIssuesByTitle(`BENCH CHILD ${tag}`))[0];
      if (!parent) return { pass: false, detail: "parent missing" };
      if (!child) return { pass: false, detail: "child not created" };
      return { pass: child.parent === parent.identifier, detail: `child.parent=${child.parent}, want ${parent.identifier}` };
    },
  },
];
