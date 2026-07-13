/** Validates benchmark plumbing (Linear connectivity, seed/verify, configs)
 *  WITHOUT spawning the agent - safe to run in restricted environments. */
import { buildConditions, writeMcpConfig } from "./conditions.js";
import { TASKS } from "./tasks.js";
import { countOpen, archiveByPrefix, viewerId } from "./lib/linear.js";

const conds = buildConditions();
console.log("conditions:", conds.map((c) => c.id).join(", "));
console.log("tasks:", TASKS.map((t) => t.id).join(", "));
console.log("mcp config:", writeMcpConfig());
console.log("viewerId:", (await viewerId()).slice(0, 8));
console.log("open count (live):", await countOpen());

// Exercise seed + verify for a write task, then perform the action ourselves.
const task = TASKS.find((t) => t.id === "write-update-state")!;
const ctx = { tag: "selfcheck" };
await archiveByPrefix("BENCH ");
await task.seed!(ctx);
const before = await task.verify(ctx, "");
console.log("verify before action (expect fail):", before.pass, "|", before.detail);

// Simulate the agent completing the task via our own CLI resolvers.
const { findIssuesByTitle } = await import("./lib/linear.js");
const seeded = (await findIssuesByTitle("BENCH UPDATE selfcheck"))[0];
const { resolveIssueRef, resolveStateId } = await import("../src/linear/resolve.js");
const ref = await resolveIssueRef(seeded.identifier);
const done = await resolveStateId(ref.team.id, "Done");
const { gql } = await import("../src/linear/client.js");
await gql(`mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ success } }`, {
  id: ref.identifier,
  i: { stateId: done.id },
});
const after = await task.verify(ctx, "");
console.log("verify after action (expect pass):", after.pass, "|", after.detail);

await archiveByPrefix("BENCH ");
console.log("cleanup done");
