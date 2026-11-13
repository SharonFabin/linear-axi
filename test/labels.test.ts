import { describe, it, expect, vi, beforeEach } from "vitest";

const gql = vi.fn();
vi.mock("../src/linear/client.js", () => ({ gql: (...a: unknown[]) => gql(...a), getClient: () => ({}), defaultTeam: () => undefined }));
vi.mock("../src/lib/context.js", () => ({
  resolveTeamScope: async (_c: unknown, key?: string) => (key ? { team: { id: `t-${key}`, key } } : {}),
}));

import { labelCreate } from "../src/commands/label/create.js";
import { labelUpdate } from "../src/commands/label/update.js";
import { labelDelete } from "../src/commands/label/delete.js";
import { labelList } from "../src/commands/label/list.js";
import { issueCreate } from "../src/commands/issue/create.js";
import { parseLabelFlags, normalizeColor, resolveLabelIds } from "../src/linear/labels.js";
import { splitList } from "../src/linear/resolve.js";

const U = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const lbl = (n: number, name: string, team: string | null, extra: object = {}) => ({
  id: U(n), name, color: "#111111", description: null, isGroup: false, parent: null,
  team: team ? { id: `t-${team}`, key: team } : null, ...extra,
});
let LABELS: ReturnType<typeof lbl>[] = [];
let mutations: { query: string; vars: any }[] = [];
let out = "";

beforeEach(() => {
  mutations = [];
  out = "";
  vi.spyOn(process.stdout, "write").mockImplementation((s: any) => ((out += s), true));
  gql.mockReset();
  gql.mockImplementation(async (query: string, vars: any) => {
    if (query.includes("issueLabels(")) return { issueLabels: { nodes: LABELS, pageInfo: { hasNextPage: false, endCursor: null } } };
    mutations.push({ query, vars });
    return { issueLabelCreate: { success: true, issueLabel: lbl(99, "New", "A") }, issueLabelUpdate: { success: true, issueLabel: lbl(1, "Bug", "A") }, issueLabelDelete: { success: true } };
  });
  LABELS = [lbl(1, "Bug", "A"), lbl(2, "Bug", "B"), lbl(3, "Ops", null), lbl(4, "Prio", "A", { isGroup: true })];
});

const fail = async (p: Promise<unknown>) => p.then(() => { throw new Error("should throw"); }, (e) => e);

describe("label flags", () => {
  it("--label with --add-label/--remove-label is a usage error", () => {
    for (const f of [{ label: "a", "add-label": "b" }, { label: "a", "remove-label": "b" }]) {
      try { parseLabelFlags(f, splitList); throw new Error("no"); } catch (e: any) { expect(e.exitCode).toBe(2); }
    }
  });
  it("rejects a label in both add and remove", () => {
    expect(() => parseLabelFlags({ "add-label": "Bug", "remove-label": "bug" }, splitList)).toThrowError(/both/);
  });
  it("validates colors", () => {
    expect(normalizeColor("#EB5757")).toBe("#eb5757");
    expect(() => normalizeColor("EB5757")).toThrowError(/invalid color/);
    expect(() => normalizeColor("red")).toThrowError(/invalid color/);
  });
  it("resolves team label before workspace, errors on unknown", async () => {
    LABELS = [lbl(1, "Bug", null), lbl(2, "Bug", "A")];
    expect(await resolveLabelIds("t-A", ["bug"])).toEqual([U(2)]);
    expect((await fail(resolveLabelIds("t-A", ["nope"]))).exitCode).toBe(2);
  });
});

describe("label create", () => {
  it("rejects colors without # before mutating", async () => {
    expect((await fail(labelCreate(["--name", "Fresh", "--team", "A", "--color", "abcdef"]))).exitCode).toBe(2);
    expect(mutations).toHaveLength(0);
  });
  it("is a no-op when the name exists in that scope", async () => {
    expect(await labelCreate(["--name", "bug", "--team", "A"])).toBe(0);
    expect(mutations).toHaveLength(0);
    expect(out).toContain("already exists");
  });
  it("creates with team, color and parent", async () => {
    await labelCreate(["--name", "P1", "--team", "A", "--color", "#abcdef", "--parent", "Prio"]);
    expect(mutations[0]!.vars.input).toEqual({ name: "P1", teamId: "t-A", color: "#abcdef", parentId: U(4) });
  });
  it("creates a workspace label without teamId", async () => {
    await labelCreate(["--name", "Fresh", "--workspace"]);
    expect(mutations[0]!.vars.input).toEqual({ name: "Fresh" });
  });
});

describe("label update", () => {
  it("rejects colors without # before mutating", async () => {
    expect((await fail(labelUpdate(["Ops", "--color", "abcdef"]))).exitCode).toBe(2);
    expect(mutations).toHaveLength(0);
  });
  it("errors on an ambiguous name listing candidates, --team disambiguates", async () => {
    const e = await fail(labelUpdate(["Bug", "--color", "#ffffff"]));
    expect(e.exitCode).toBe(2);
    expect(e.help.join("\n")).toContain("[A]");
    expect(e.help.join("\n")).toContain("[B]");
    await labelUpdate(["Bug", "--color", "#ffffff", "--team", "A"]);
    expect(mutations[0]!.vars).toEqual({ id: U(1), input: { color: "#ffffff" } });
  });
  it("is idempotent", async () => {
    await labelUpdate(["Ops", "--color", "#111111"]);
    expect(mutations).toHaveLength(0);
    expect(out).toContain("no changes");
  });
  it("moves into and out of a group", async () => {
    await labelUpdate(["Bug", "--team", "A", "--parent", "Prio"]);
    expect(mutations[0]!.vars.input).toEqual({ parentId: U(4) });
    LABELS[0] = lbl(1, "Bug", "A", { parent: { id: U(4), name: "Prio" } });
    await labelUpdate(["Bug", "--team", "A", "--parent", "none"]);
    expect(mutations[1]!.vars.input).toEqual({ parentId: null });
  });
});

describe("label delete", () => {
  it("refuses without --yes", async () => {
    expect((await fail(labelDelete(["Ops"]))).exitCode).toBe(2);
    expect(mutations).toHaveLength(0);
  });
  it("deletes by name or id with --yes", async () => {
    await labelDelete(["Ops", "--yes"]);
    await labelDelete([U(2), "--yes"]);
    expect(mutations.map((m) => m.vars.id)).toEqual([U(3), U(2)]);
  });
});

describe("label list", () => {
  it("shows scope, group and color", async () => {
    await labelList(["--all"]);
    expect(out).toContain("count: 4");
    expect(out).toContain("workspace");
    expect(out).toContain("(group)");
  });
});

describe("issue create labels", () => {
  it("uses --label to set initial team and workspace labels", async () => {
    gql.mockImplementationOnce(async () => ({ issueLabels: { nodes: LABELS, pageInfo: { hasNextPage: false, endCursor: null } } }));
    gql.mockImplementationOnce(async (query: string, vars: any) => {
      mutations.push({ query, vars });
      return { issueCreate: { success: true, issue: { id: "u", identifier: "A-1", title: "New", url: "https://linear.app/issue/A-1", state: null, assignee: null } } };
    });
    expect(await issueCreate(["--title", "New", "--team", "A", "--label", "Bug,Ops"])).toBe(0);
    expect(mutations[0]!.vars.input).toEqual({ title: "New", teamId: "t-A", labelIds: [U(1), U(3)] });
  });
  it("rejects --add-label on creation", async () => {
    expect((await fail(issueCreate(["--title", "New", "--team", "A", "--add-label", "Bug"]))).exitCode).toBe(2);
    expect(gql).not.toHaveBeenCalled();
  });
});

describe("issue update --add-label / --remove-label", () => {
  const run = async (args: string[], current: string[], ids = ["A-1"]) => {
    LABELS = [lbl(1, "Bug", "A"), lbl(2, "Triage", "A"), lbl(3, "Ops", null)];
    gql.mockImplementation(async (query: string, vars: any) => {
      if (query.includes("issueLabels(")) return { issueLabels: { nodes: LABELS, pageInfo: { hasNextPage: false, endCursor: null } } };
      if (query.includes("issue(id:")) {
        return { issue: { id: "u", identifier: vars.id, title: "t", priority: 0, team: { id: "t-A", key: "A" }, state: null, assignee: null, labels: { nodes: current.map((n) => ({ id: U(Number(n)), name: n })) } } };
      }
      mutations.push({ query, vars });
      return { issueUpdate: { success: true, issue: { identifier: vars.id, priority: 0, state: null, assignee: null } } };
    });
    const { issueUpdate } = await import("../src/commands/issue/update.js");
    return issueUpdate([...ids, ...args]);
  };

  it.each([["A-1"], ["A-1", "A-2"]].map((ids) => [ids]))(
    "uses Linear's atomic IssueUpdateInput contract for %j",
    async (ids) => {
      for (const [args, input] of [
        [["--add-label", "Bug"], { addedLabelIds: [U(1)] }],
        [["--remove-label", "Triage"], { removedLabelIds: [U(2)] }],
        [["--add-label", "Bug", "--remove-label", "Triage"], { addedLabelIds: [U(1)], removedLabelIds: [U(2)] }],
      ] as const) {
        mutations = [];
        expect(await run([...args], ["2", "3"], ids)).toBe(0);
        expect(mutations.map((m) => m.vars)).toEqual(ids.map((id) => ({ id, input })));
      }
    },
  );
  it("sends deltas even when a stale or partial snapshot appears satisfied", async () => {
    await run(["--add-label", "Bug", "--remove-label", "Triage"], ["1"]);
    expect(mutations[0]!.vars.input).toEqual({ addedLabelIds: [U(1)], removedLabelIds: [U(2)] });
  });
  it("keeps --label as explicit replacement", async () => {
    await run(["--label", "Bug"], ["2", "3"]);
    expect(mutations[0]!.vars.input).toEqual({ labelIds: [U(1)] });
  });
  it("errors on unknown names and on --label combination", async () => {
    expect((await fail(run(["--add-label", "Nope"], []))).exitCode).toBe(2);
    expect((await fail(run(["--label", "Bug", "--add-label", "Ops"], []))).exitCode).toBe(2);
  });
});
