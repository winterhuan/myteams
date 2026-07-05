import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { MissionSchema, PhaseId, type Mission } from "./types.ts";
import { missionPath, missionsDir } from "./paths.ts";

export class MissionStore {
  constructor(private readonly teamsRoot: string) {}

  async listMissions(teamId: string): Promise<Mission[]> {
    const dir = missionsDir(this.teamsRoot, teamId);
    if (!existsSync(dir)) return [];
    const files = await readdir(dir);
    const missions = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => this.loadMission(teamId, f.replace(/\.json$/, ""))),
    );
    return missions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadMission(teamId: string, missionId: string): Promise<Mission> {
    const path = missionPath(this.teamsRoot, teamId, missionId);
    const raw = await readFile(path, "utf-8");
    return MissionSchema.parse(JSON.parse(raw));
  }

  async saveMission(mission: Mission): Promise<void> {
    const path = missionPath(this.teamsRoot, mission.teamId, mission.id);
    await mkdir(missionsDir(this.teamsRoot, mission.teamId), { recursive: true });
    mission.updatedAt = new Date().toISOString();
    await writeFile(path, JSON.stringify(mission, null, 2) + "\n");
  }

  async createMission(input: {
    id: string;
    title: string;
    teamId: string;
    brief: string;
  }): Promise<Mission> {
    const now = new Date().toISOString();
    const mission: Mission = {
      id: input.id,
      title: input.title,
      teamId: input.teamId,
      status: "active",
      currentPhase: "brainstorm",
      brief: input.brief,
      createdAt: now,
      updatedAt: now,
      artifacts: [],
    };
    await this.saveMission(mission);
    return mission;
  }

  async advancePhase(
    teamId: string,
    missionId: string,
    nextPhase: PhaseId,
  ): Promise<Mission> {
    const mission = await this.loadMission(teamId, missionId);
    mission.currentPhase = nextPhase;
    await this.saveMission(mission);
    return mission;
  }
}