import { join } from "node:path";
import { TeamStore } from "./team-store.ts";
import { MissionStore } from "./mission-store.ts";
import { LedgerStore } from "./ledger-store.ts";
import { BriefingStore } from "./briefing-store.ts";
import { ContextBuilder } from "./context-builder.ts";
import { resolveTeamsRoot } from "./paths.ts";

export interface PlatformOptions {
  repoRoot: string;
}

export class Platform {
  readonly teams: TeamStore;
  readonly missions: MissionStore;
  readonly ledger: LedgerStore;
  readonly briefing: BriefingStore;
  readonly context: ContextBuilder;
  readonly teamsRoot: string;

  constructor(options: PlatformOptions) {
    this.teamsRoot = resolveTeamsRoot(options.repoRoot);
    this.teams = new TeamStore(this.teamsRoot);
    this.missions = new MissionStore(this.teamsRoot);
    this.ledger = new LedgerStore(this.teamsRoot);
    this.briefing = new BriefingStore(this.teamsRoot);
    this.context = new ContextBuilder(
      this.teamsRoot,
      this.briefing,
      this.ledger,
    );
  }

  static fromCwd(cwd = process.cwd()): Platform {
    return new Platform({ repoRoot: cwd });
  }
}

export function defaultRepoRoot(): string {
  return process.env.AGENTTEAMS_ROOT ?? process.cwd();
}