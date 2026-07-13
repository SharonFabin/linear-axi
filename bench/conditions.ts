/**
 * The interface conditions we compare. Each isolates the agent to exactly one
 * way of talking to Linear so the metrics reflect that interface's ergonomics.
 */
import fs from "node:fs";
import path from "node:path";
import { CONFIG, rootDir } from "./config.js";

export interface Condition {
  id: string;
  label: string;
  systemPrompt: string;
  allowedTools: string[];
  disallowedTools: string[];
  mcpConfigPath?: string;
  env: Record<string, string>;
}

const binDir = path.resolve(rootDir(), "bench/bin");
const commonEnv = {
  LINEAR_API_KEY: CONFIG.apiKey,
  LINEAR_API_TOKEN: CONFIG.apiKey,
  LINEAR_AXI_DEFAULT_TEAM: CONFIG.teamKey,
  PATH: `${binDir}:${process.env.PATH ?? ""}`,
};

/** Write the MCP config for the linear-mcp condition (gitignored, holds the token). */
export function writeMcpConfig(): string {
  fs.mkdirSync(CONFIG.resultsDir, { recursive: true });
  const p = path.resolve(CONFIG.resultsDir, "linear-mcp.config.json");
  const cfg = {
    mcpServers: {
      linear: {
        command: "npx",
        args: ["-y", "@tacticlaunch/mcp-linear"],
        env: { LINEAR_API_TOKEN: CONFIG.apiKey },
      },
    },
  };
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
  return p;
}

export function buildConditions(): Condition[] {
  const team = CONFIG.teamKey;

  const linearAxi: Condition = {
    id: "linear-axi",
    label: "linear-axi (AXI CLI)",
    systemPrompt:
      `You interact with Linear ONLY through the \`linear-axi\` command-line tool via Bash. ` +
      `Run \`linear-axi --help\` and \`linear-axi issue <subcommand> --help\` to discover usage. ` +
      `The default team is "${team}". Do not use any other tool or network access. ` +
      `When the task asks a question, end with a concise final answer.`,
    allowedTools: ["Bash"],
    disallowedTools: ["WebSearch", "WebFetch", "mcp__linear"],
    env: commonEnv,
  };

  const linearMcp: Condition = {
    id: "linear-mcp",
    label: "Linear MCP",
    systemPrompt:
      `You interact with Linear ONLY through the provided Linear MCP tools (mcp__linear__*). ` +
      `The default team is "${team}". Do not use Bash or any other network access. ` +
      `When the task asks a question, end with a concise final answer.`,
    allowedTools: ["mcp__linear"],
    disallowedTools: ["Bash", "WebSearch", "WebFetch"],
    mcpConfigPath: writeMcpConfig(),
    env: commonEnv,
  };

  const raw: Condition = {
    id: "raw-graphql",
    label: "raw GraphQL (curl)",
    systemPrompt:
      `You interact with Linear ONLY through its GraphQL API using curl via Bash. ` +
      `Endpoint: https://api.linear.app/graphql. Auth header: "Authorization: $LINEAR_API_KEY". ` +
      `Content-Type: application/json. The default team key is "${team}". ` +
      `Do not use any other tool. When the task asks a question, end with a concise final answer.`,
    allowedTools: ["Bash"],
    disallowedTools: ["WebSearch", "WebFetch", "mcp__linear"],
    env: commonEnv,
  };

  const schpet: Condition = {
    id: "schpet-cli",
    label: "@schpet/linear-cli",
    systemPrompt:
      `You interact with Linear through the \`linear\` command-line tool (schpet/linear-cli) via Bash. ` +
      `Run \`linear --help\` to discover usage. The default team key is "${team}". ` +
      `Do not use any other network access. When the task asks a question, end with a concise final answer.`,
    allowedTools: ["Bash"],
    disallowedTools: ["WebSearch", "WebFetch", "mcp__linear"],
    env: commonEnv,
  };

  return [linearAxi, linearMcp, raw, schpet];
}

export function conditionById(id: string): Condition | undefined {
  return buildConditions().find((c) => c.id === id);
}
