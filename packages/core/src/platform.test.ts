import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Platform } from "./platform.ts";

const repoRoot = join(import.meta.dir, "../../..");

describe("Platform", () => {
  test("loads all three team templates", async () => {
    const platform = new Platform({ repoRoot });
    const teams = await platform.teams.loadAllTeams();
    expect(teams.length).toBe(3);
    const ids = teams.map((t) => t.id).sort();
    expect(ids).toEqual(["app-dev", "novel", "short-drama"]);
  });

  test("creates mission and ledger", async () => {
    const platform = new Platform({ repoRoot });
    const mission = await platform.missions.createMission({
      id: "test-mission",
      title: "Test",
      teamId: "app-dev",
      brief: "verify platform",
    });
    expect(mission.currentPhase).toBe("brainstorm");

    await platform.ledger.append({
      teamId: "app-dev",
      missionId: mission.id,
      type: "message",
      authorId: "human",
      content: "hello team",
    });

    const entries = await platform.ledger.read("app-dev", mission.id);
    expect(entries.length).toBeGreaterThan(0);
  });
});