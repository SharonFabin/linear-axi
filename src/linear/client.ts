/**
 * Linear SDK client, initialised from LINEAR_API_KEY.
 * Auth is via a personal API key only - no interactive prompts (principle #6).
 */
import { config as loadEnv } from "dotenv";
import { LinearClient } from "@linear/sdk";
import { AxiError } from "../lib/errors.js";
import { readConfig } from "../lib/config.js";

loadEnv();

let cached: LinearClient | undefined;

/** Resolve the API key: env var -> cwd .env (via dotenv) -> saved config file. */
export function resolveApiKey(): string | undefined {
  return process.env.LINEAR_API_KEY || readConfig().apiKey;
}

export function getClient(): LinearClient {
  if (cached) return cached;
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new AxiError("LINEAR_API_KEY is not set", {
      exitCode: 2,
      help: [
        "Create a key at Linear -> Settings -> Security & access -> Personal API keys",
        "Save it: linear-axi setup auth --key lin_api_...",
        "Or export it: export LINEAR_API_KEY=lin_api_...",
      ],
    });
  }
  cached = new LinearClient({ apiKey });
  return cached;
}

/** Default team key/name (env or saved config), used when --team is omitted. */
export function defaultTeam(): string | undefined {
  return process.env.LINEAR_AXI_DEFAULT_TEAM || readConfig().defaultTeam || undefined;
}

/**
 * Run a raw GraphQL query and return `data`. Using raw GraphQL (instead of the
 * SDK's lazy linked fields) lets us fetch exactly the fields we need in a
 * single request, avoiding N+1 round-trips for state/assignee/etc.
 * Dependency errors are translated to a clean AxiError (principle #6).
 */
export async function gql<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const client = getClient();
  try {
    const res = await client.client.rawRequest(query, variables);
    return res.data as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new AxiError(`Linear API request failed: ${message}`);
  }
}
