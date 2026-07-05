#!/usr/bin/env bun
import { Platform } from "@agentteams/core";
import { EngineRegistry } from "@agentteams/harness";

const [, , command, ...args] = process.argv;
const platform = Platform.fromCwd();
const engines = new EngineRegistry();

async function main(): Promise<void> {
  switch (command) {
    case "list":
      await cmdList();
      break;
    case "show":
      await cmdShow(args[0]);
      break;
    case "mission":
      await cmdMission(args);
      break;
    case "ledger":
      await cmdLedger(args[0], args[1]);
      break;
    case "briefing":
      await cmdBriefing(args[0]);
      break;
    case "engines":
      await cmdEngines();
      break;
    case undefined:
    case "help":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

async function cmdList(): Promise<void> {
  const teams = await platform.teams.loadAllTeams();
  if (teams.length === 0) {
    console.log("No teams found.");
    return;
  }
  for (const team of teams) {
    console.log(`${team.id}\t${team.name}\t[${team.domain}]`);
  }
}

async function cmdShow(teamId: string | undefined): Promise<void> {
  if (!teamId) {
    console.error("Usage: teams show <team-id>");
    process.exit(1);
  }
  const team = await platform.teams.loadTeam(teamId);
  console.log(JSON.stringify(team, null, 2));
}

async function cmdMission(argv: string[]): Promise<void> {
  const sub = argv[0];
  if (sub === "create") {
    const teamId = argv[1];
    const id = argv[2];
    const title = argv[3];
    const brief = argv.slice(4).join(" ");
    if (!teamId || !id || !title || !brief) {
      console.error(
        "Usage: teams mission create <team-id> <mission-id> <title> <brief...>",
      );
      process.exit(1);
    }
    await platform.teams.ensureTeamWorkspace(teamId);
    const mission = await platform.missions.createMission({
      id,
      title,
      teamId,
      brief,
    });
    await platform.ledger.append({
      teamId,
      missionId: id,
      type: "message",
      authorId: "human",
      content: `Mission created: ${title}`,
    });
    console.log(JSON.stringify(mission, null, 2));
    return;
  }

  if (sub === "list") {
    const teamId = argv[1];
    if (!teamId) {
      console.error("Usage: teams mission list <team-id>");
      process.exit(1);
    }
    const missions = await platform.missions.listMissions(teamId);
    for (const m of missions) {
      console.log(
        `${m.id}\t${m.status}\t${m.currentPhase}\t${m.title}`,
      );
    }
    return;
  }

  if (sub === "advance") {
    const teamId = argv[1];
    const missionId = argv[2];
    const phase = argv[3] as "brainstorm" | "scheme" | "delivery";
    if (!teamId || !missionId || !phase) {
      console.error(
        "Usage: teams mission advance <team-id> <mission-id> <brainstorm|scheme|delivery>",
      );
      process.exit(1);
    }
    const mission = await platform.missions.advancePhase(
      teamId,
      missionId,
      phase,
    );
    await platform.ledger.append({
      teamId,
      missionId,
      type: "phase_transition",
      authorId: "platform",
      content: `Advanced to phase: ${phase}`,
    });
    console.log(JSON.stringify(mission, null, 2));
    return;
  }

  console.error("Usage: teams mission <create|list|advance> ...");
  process.exit(1);
}

async function cmdLedger(
  teamId: string | undefined,
  missionId: string | undefined,
): Promise<void> {
  if (!teamId || !missionId) {
    console.error("Usage: teams ledger <team-id> <mission-id>");
    process.exit(1);
  }
  const entries = await platform.ledger.read(teamId, missionId);
  for (const e of entries) {
    console.log(
      `${e.timestamp}\t${e.type}\t${e.authorId}\t${e.content}`,
    );
  }
}

async function cmdBriefing(teamId: string | undefined): Promise<void> {
  if (!teamId) {
    console.error("Usage: teams briefing <team-id>");
    process.exit(1);
  }
  const entries = await platform.briefing.readAll(teamId);
  for (const e of entries) {
    console.log(`[${e.bucket}] ${e.title}: ${e.content}`);
  }
}

async function cmdEngines(): Promise<void> {
  const available = await engines.listAvailable();
  console.log(available.join("\n"));
}

function printHelp(): void {
  console.log(`agentTeams CLI

Usage:
  teams list
  teams show <team-id>
  teams mission create <team-id> <mission-id> <title> <brief...>
  teams mission list <team-id>
  teams mission advance <team-id> <mission-id> <phase>
  teams ledger <team-id> <mission-id>
  teams briefing <team-id>
  teams engines
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});