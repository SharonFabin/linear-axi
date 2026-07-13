/**
 * Ambient context resolution (principles #7, #8): who is "me" and which team
 * is in scope. Team can be given by key (e.g. MYT) or name (case-insensitive).
 *
 * An explicit `--team X` that doesn't exist is a hard usage error. A misconfigured
 * default (LINEAR_AXI_DEFAULT_TEAM) is tolerated: we fall back to "all teams" and
 * surface a note, so a bad default never blocks read commands.
 */
import type { LinearClient, Team, User } from "@linear/sdk";
import { AxiError } from "./errors.js";
import { defaultTeam } from "../linear/client.js";

export async function resolveViewer(client: LinearClient): Promise<User> {
  return client.viewer;
}

async function findTeam(client: LinearClient, wanted: string): Promise<Team | undefined> {
  const teams = await client.teams({ first: 250 });
  const needle = wanted.toLowerCase();
  return teams.nodes.find(
    (t) => t.key.toLowerCase() === needle || t.name.toLowerCase() === needle,
  );
}

async function availableTeams(client: LinearClient): Promise<string> {
  const teams = await client.teams({ first: 250 });
  return teams.nodes.map((t) => `${t.key} (${t.name})`).join(", ");
}

/** Resolve an explicit team argument; throws (exit 2) if it doesn't exist. */
export async function resolveTeamStrict(client: LinearClient, teamArg: string): Promise<Team> {
  const match = await findTeam(client, teamArg);
  if (!match) {
    throw new AxiError(`team "${teamArg}" not found`, {
      exitCode: 2,
      help: [`available teams: ${await availableTeams(client)}`, "Pass one with --team <key>"],
    });
  }
  return match;
}

export interface TeamScope {
  team?: Team;
  /** Present when a configured default team could not be resolved. */
  note?: string;
}

/**
 * Resolve the team scope for a command: an explicit --team (strict), otherwise
 * the configured default (lenient). Returns `{}` when neither is set.
 */
export async function resolveTeamScope(
  client: LinearClient,
  teamArg?: string,
): Promise<TeamScope> {
  if (teamArg) return { team: await resolveTeamStrict(client, teamArg) };

  const dflt = defaultTeam();
  if (!dflt) return {};

  const match = await findTeam(client, dflt);
  if (match) return { team: match };
  return { note: `default team "${dflt}" not found - showing all teams` };
}
