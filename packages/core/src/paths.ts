import { join } from "node:path";

export function resolveTeamsRoot(repoRoot: string): string {
  return join(repoRoot, "teams");
}

export function teamDir(teamsRoot: string, teamId: string): string {
  return join(teamsRoot, teamId);
}

export function teamConfigPath(teamsRoot: string, teamId: string): string {
  return join(teamDir(teamsRoot, teamId), "team.yaml");
}

export function missionsDir(teamsRoot: string, teamId: string): string {
  return join(teamDir(teamsRoot, teamId), "missions");
}

export function missionPath(
  teamsRoot: string,
  teamId: string,
  missionId: string,
): string {
  return join(missionsDir(teamsRoot, teamId), `${missionId}.json`);
}

export function ledgerPath(
  teamsRoot: string,
  teamId: string,
  missionId: string,
): string {
  return join(teamDir(teamsRoot, teamId), "ledger", `${missionId}.jsonl`);
}

export function briefingDir(teamsRoot: string, teamId: string): string {
  return join(teamDir(teamsRoot, teamId), "briefing");
}