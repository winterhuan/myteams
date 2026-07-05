import type { Team, Mission, Member } from "./types.ts";
import { BriefingStore } from "./briefing-store.ts";
import { LedgerStore } from "./ledger-store.ts";

export interface AgentContext {
  system: string;
  recentLedger: string;
}

export class ContextBuilder {
  constructor(
    private readonly teamsRoot: string,
    private readonly briefing: BriefingStore,
    private readonly ledger: LedgerStore,
  ) {}

  async buildForMember(
    team: Team,
    mission: Mission,
    member: Member,
  ): Promise<AgentContext> {
    const briefingSummary = await this.briefing.buildContextSummary(team.id);
    const entries = await this.ledger.read(team.id, mission.id);
    const recent = entries.slice(-12);

    const system = [
      `# ${team.name} — ${member.role}`,
      "",
      "## Charter",
      `Team domain: ${team.domain}`,
      `Mission: ${mission.title}`,
      `Phase: ${mission.currentPhase}`,
      `Brief: ${mission.brief}`,
      "",
      "## Briefing (team memory)",
      briefingSummary || "(empty — first engagement)",
      "",
      "## Member",
      `Handle: ${member.handle}`,
      `Autonomy: ${member.autonomy}`,
      member.persona ? `Persona file: ${member.persona}` : "",
      "",
      "## Phase guidance",
      ...team.phases
        .filter((p) => p.id === mission.currentPhase)
        .map((p) => `- ${p.label}: ${p.description ?? ""}`),
    ]
      .filter(Boolean)
      .join("\n");

    const recentLedger = recent
      .map(
        (e) =>
          `[${e.timestamp}] ${e.authorId} (${e.type}): ${e.content}`,
      )
      .join("\n");

    return { system, recentLedger };
  }
}