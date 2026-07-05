import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { TeamSchema, type Team } from "./types.ts";
import { teamConfigPath, teamDir } from "./paths.ts";

export class TeamStore {
  constructor(private readonly teamsRoot: string) {}

  async listTeamIds(): Promise<string[]> {
    if (!existsSync(this.teamsRoot)) return [];
    const entries = await readdir(this.teamsRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  async loadTeam(teamId: string): Promise<Team> {
    const path = teamConfigPath(this.teamsRoot, teamId);
    const raw = await readFile(path, "utf-8");
    const parsed = parseYaml(raw);
    return TeamSchema.parse(parsed);
  }

  async loadAllTeams(): Promise<Team[]> {
    const ids = await this.listTeamIds();
    return Promise.all(ids.map((id) => this.loadTeam(id)));
  }

  async ensureTeamWorkspace(teamId: string): Promise<void> {
    const base = teamDir(this.teamsRoot, teamId);
    await mkdir(joinSub(base, "missions"), { recursive: true });
    await mkdir(joinSub(base, "ledger"), { recursive: true });
    await mkdir(joinSub(base, "briefing"), { recursive: true });
    await mkdir(joinSub(base, "members"), { recursive: true });
    await mkdir(joinSub(base, "workflows"), { recursive: true });
  }
}

function joinSub(base: string, sub: string): string {
  return `${base}/${sub}`;
}