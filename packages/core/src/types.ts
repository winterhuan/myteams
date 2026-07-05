import { z } from "zod";

export const AutonomyLevel = z.enum(["L0", "L1", "L2", "L3"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

export const CollaborationMode = z.enum(["thread", "workflow", "hybrid"]);
export type CollaborationMode = z.infer<typeof CollaborationMode>;

export const MemberKind = z.enum(["agent", "human"]);
export type MemberKind = z.infer<typeof MemberKind>;

export const MissionStatus = z.enum(["active", "paused", "done"]);
export type MissionStatus = z.infer<typeof MissionStatus>;

export const PhaseId = z.enum(["brainstorm", "scheme", "delivery"]);
export type PhaseId = z.infer<typeof PhaseId>;

export const LedgerEntryType = z.enum([
  "message",
  "decision",
  "artifact",
  "custody",
  "escalation",
  "closeout",
  "phase_transition",
]);
export type LedgerEntryType = z.infer<typeof LedgerEntryType>;

export const HarnessConfigSchema = z.object({
  engine: z.string().default("pi"),
  model: z.string().optional(),
  options: z.record(z.unknown()).optional(),
});

export const MemberSchema = z.object({
  id: z.string(),
  kind: MemberKind,
  role: z.string(),
  handle: z.string(),
  harness: HarnessConfigSchema.optional(),
  persona: z.string().optional(),
  autonomy: AutonomyLevel.default("L2"),
});

export const PhaseDefinitionSchema = z.object({
  id: PhaseId,
  label: z.string(),
  description: z.string().optional(),
  defaultMode: CollaborationMode.optional(),
  config: z.string().optional(),
});

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  description: z.string().optional(),
  defaultMode: CollaborationMode.default("hybrid"),
  phases: z.array(PhaseDefinitionSchema).min(3),
  members: z.array(MemberSchema).min(1),
  charter: z.string().default("charter.md"),
  hubLayout: z.string().optional(),
});

export type Team = z.infer<typeof TeamSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type PhaseDefinition = z.infer<typeof PhaseDefinitionSchema>;

export const MissionSchema = z.object({
  id: z.string(),
  title: z.string(),
  teamId: z.string(),
  status: MissionStatus.default("active"),
  currentPhase: PhaseId.default("brainstorm"),
  brief: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  artifacts: z.array(
    z.object({
      path: z.string(),
      label: z.string(),
      phase: PhaseId.optional(),
      createdAt: z.string(),
    }),
  ),
});

export type Mission = z.infer<typeof MissionSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string(),
  missionId: z.string(),
  type: LedgerEntryType,
  authorId: z.string(),
  content: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const BriefingBucket = z.enum(["principles", "patterns", "scars"]);
export type BriefingBucket = z.infer<typeof BriefingBucket>;

export const BriefingEntrySchema = z.object({
  id: z.string(),
  bucket: BriefingBucket,
  title: z.string(),
  content: z.string(),
  sourceMissionId: z.string().optional(),
  createdAt: z.string(),
});

export type BriefingEntry = z.infer<typeof BriefingEntrySchema>;