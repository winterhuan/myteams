import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  BriefingEntrySchema,
  type BriefingBucket,
  type BriefingEntry,
} from "./types.ts";
import { briefingDir } from "./paths.ts";

export class BriefingStore {
  constructor(private readonly teamsRoot: string) {}

  private bucketPath(teamId: string, bucket: BriefingBucket): string {
    return `${briefingDir(this.teamsRoot, teamId)}/${bucket}.jsonl`;
  }

  async append(input: {
    teamId: string;
    bucket: BriefingBucket;
    title: string;
    content: string;
    sourceMissionId?: string;
  }): Promise<BriefingEntry> {
    const entry: BriefingEntry = BriefingEntrySchema.parse({
      id: randomUUID(),
      bucket: input.bucket,
      title: input.title,
      content: input.content,
      sourceMissionId: input.sourceMissionId,
      createdAt: new Date().toISOString(),
    });

    const path = this.bucketPath(input.teamId, input.bucket);
    await mkdir(briefingDir(this.teamsRoot, input.teamId), { recursive: true });
    await appendLine(path, entry);
    await this.touchChangelog(input.teamId, entry);
    return entry;
  }

  async readBucket(
    teamId: string,
    bucket: BriefingBucket,
  ): Promise<BriefingEntry[]> {
    const path = this.bucketPath(teamId, bucket);
    if (!existsSync(path)) return [];
    const raw = await readFile(path, "utf-8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => BriefingEntrySchema.parse(JSON.parse(line)));
  }

  async readAll(teamId: string): Promise<BriefingEntry[]> {
    const dir = briefingDir(this.teamsRoot, teamId);
    if (!existsSync(dir)) return [];
    const files = await readdir(dir);
    const entries: BriefingEntry[] = [];
    for (const file of files.filter((f) => f.endsWith(".jsonl"))) {
      const raw = await readFile(`${dir}/${file}`, "utf-8");
      for (const line of raw.split("\n").filter(Boolean)) {
        entries.push(BriefingEntrySchema.parse(JSON.parse(line)));
      }
    }
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async buildContextSummary(teamId: string, limit = 8): Promise<string> {
    const entries = await this.readAll(teamId);
    if (entries.length === 0) return "";
    return entries
      .slice(0, limit)
      .map((e) => `[${e.bucket}] ${e.title}: ${e.content}`)
      .join("\n");
  }

  private async touchChangelog(
    teamId: string,
    entry: BriefingEntry,
  ): Promise<void> {
    const path = `${briefingDir(this.teamsRoot, teamId)}/changelog.md`;
    const line = `- ${entry.createdAt} **${entry.bucket}** ${entry.title}\n`;
    if (existsSync(path)) {
      const { appendFile } = await import("node:fs/promises");
      await appendFile(path, line);
    } else {
      await writeFile(path, `# Briefing Changelog\n\n${line}`);
    }
  }
}

async function appendLine(path: string, entry: BriefingEntry): Promise<void> {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, JSON.stringify(entry) + "\n");
}