import { appendFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  LedgerEntrySchema,
  type LedgerEntry,
  type LedgerEntryType,
} from "./types.ts";
import { ledgerPath } from "./paths.ts";

export class LedgerStore {
  constructor(private readonly teamsRoot: string) {}

  async append(input: {
    teamId: string;
    missionId: string;
    type: LedgerEntryType;
    authorId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<LedgerEntry> {
    const entry: LedgerEntry = LedgerEntrySchema.parse({
      id: randomUUID(),
      missionId: input.missionId,
      type: input.type,
      authorId: input.authorId,
      content: input.content,
      timestamp: new Date().toISOString(),
      metadata: input.metadata,
    });

    const path = ledgerPath(this.teamsRoot, input.teamId, input.missionId);
    await mkdir(path.substring(0, path.lastIndexOf("/")), { recursive: true });
    await appendFile(path, JSON.stringify(entry) + "\n");
    return entry;
  }

  async read(teamId: string, missionId: string): Promise<LedgerEntry[]> {
    const path = ledgerPath(this.teamsRoot, teamId, missionId);
    if (!existsSync(path)) return [];
    const raw = await readFile(path, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => LedgerEntrySchema.parse(JSON.parse(line)));
  }
}