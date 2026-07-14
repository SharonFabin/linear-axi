/**
 * `linear-axi team list` - discover team keys and how many projects each holds.
 * A shared team can mix several unrelated projects, so surfacing keys (needed for
 * --team) and project counts (a hint to scope with --project) removes guesswork.
 */
import { gql } from "../../linear/client.js";
import { parseArgs, type FlagSchema } from "../../lib/args.js";
import { print, printLine, type Help } from "../../output/toon.js";

const SCHEMA: FlagSchema = {};

const HELP = `linear-axi team list - list teams (keys, names, project counts)

Examples:
  linear-axi team list

Use a team key with other commands:
  linear-axi issue list --team <key>
  linear-axi issue create --title "..." --team <key>`;

const PROJECT_CAP = 25;

interface TeamNode {
  key: string;
  name: string;
  projects: { nodes: { id: string }[] };
}

export async function teamList(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "team list");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const data = await gql<{ teams: { nodes: TeamNode[] } }>(TEAMS_QUERY, { first: 150 });
  const teams = data.teams.nodes;

  if (teams.length === 0) {
    printLine("teams: 0 teams found for this API key");
    return 0;
  }

  const rows = teams.map((t) => {
    const n = t.projects.nodes.length;
    return { key: t.key, name: t.name, projects: n === PROJECT_CAP ? `${PROJECT_CAP}+` : n };
  });

  const help: Help = [
    "Run `linear-axi issue list --team <key>` to list a team's issues",
    "Run `linear-axi issue list --team <key> --fields project` to see each issue's project",
  ];
  print({ count: teams.length, teams: rows }, help);
  return 0;
}

const TEAMS_QUERY = `query($first:Int!){
  teams(first:$first){
    nodes{ key name projects(first:${PROJECT_CAP}){ nodes{ id } } }
  }
}`;
