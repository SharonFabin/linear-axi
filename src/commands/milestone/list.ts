/**
 * `linear-axi milestone list --project <p>` - enumerate a project's milestones.
 * Milestone-scoped work ("finish milestone 3") is impossible to plan if the CLI
 * can't name the milestones; this resolves a project by name/id and lists them.
 */
import { gql } from "../../linear/client.js";
import { parseArgs, requireString, type FlagSchema } from "../../lib/args.js";
import { AxiError } from "../../lib/errors.js";
import { isUuid } from "../../linear/resolve.js";
import { print, printLine, type Help } from "../../output/toon.js";

const SCHEMA: FlagSchema = {
  project: { type: "string", description: "project name (contains) or id (required)" },
};

const HELP = `linear-axi milestone list --project <p> - list a project's milestones

Required:
  --project <name or id>

Examples:
  linear-axi milestone list --project "Mobile app"
  linear-axi milestone list --project 8f1c...  (project id)

Then scope issues to one milestone:
  linear-axi issue list --milestone "<name>" --fields milestone`;

interface ProjectNode {
  id: string;
  name: string;
  projectMilestones: { nodes: MilestoneNode[] };
}

interface MilestoneNode {
  id: string;
  name: string;
  targetDate: string | null;
  sortOrder: number;
}

export async function milestoneList(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv, SCHEMA, "milestone list");
  if (parsed.help) {
    printLine(HELP);
    return 0;
  }

  const project = requireString(
    parsed,
    "project",
    "milestone list",
    'linear-axi milestone list --project "<name or id>"',
  );

  const filter = isUuid(project)
    ? { id: { eq: project } }
    : { name: { containsIgnoreCase: project } };
  const data = await gql<{ projects: { nodes: ProjectNode[] } }>(PROJECTS_QUERY, { filter });
  const projects = data.projects.nodes;

  if (projects.length === 0) {
    printLine(`milestones: no project matching "${project}"`, [
      "Run `linear-axi issue list --fields project` to see project names in use",
    ]);
    return 1;
  }
  if (projects.length > 1) {
    const names = projects.map((p) => p.name).join(", ");
    throw new AxiError(`"${project}" matches multiple projects: ${names}`, {
      exitCode: 2,
      help: ["Narrow the name, or pass the exact project id"],
    });
  }

  const proj = projects[0]!;
  const milestones = [...proj.projectMilestones.nodes].sort((a, b) => a.sortOrder - b.sortOrder);

  if (milestones.length === 0) {
    printLine(`milestones: 0 milestones in project "${proj.name}"`);
    return 0;
  }

  const rows = milestones.map((m) => ({
    name: m.name,
    target: m.targetDate ? m.targetDate.slice(0, 10) : "-",
  }));

  const help: Help = [
    `Run \`linear-axi issue list --milestone "<name>" --fields milestone\` to list a milestone's issues`,
  ];
  print({ project: proj.name, count: milestones.length, milestones: rows }, help);
  return 0;
}

const PROJECTS_QUERY = `query($filter:ProjectFilter){
  projects(first:5, filter:$filter){
    nodes{
      id name
      projectMilestones(first:100){ nodes{ id name targetDate sortOrder } }
    }
  }
}`;
