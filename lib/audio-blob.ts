import {
  del,
  list,
  put,
  type PutBlobResult,
} from "@vercel/blob";
import { getTodayBeijing } from "./date-utils";

export const AUDIO_BLOB_PREFIX = "briefing-audio/";
export const AUDIO_RETENTION_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AUDIO_DATE_PATH_RE = /^briefing-audio\/(\d{4}-\d{2}-\d{2}).*\.mp3$/;

export interface AudioBlobCleanupResult {
  retentionDays: number;
  cutoffDate: string;
  scanned: number;
  kept: number;
  deleted: number;
  skipped: number;
  deletedPathnames: string[];
}

export function getBriefingAudioPathname(date: string): string {
  return `${AUDIO_BLOB_PREFIX}${date}.mp3`;
}

export async function uploadBriefingAudio(
  date: string,
  audioBuffer: Buffer
): Promise<PutBlobResult> {
  return put(getBriefingAudioPathname(date), audioBuffer, {
    access: "public",
    contentType: "audio/mpeg",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function cleanupOldBriefingAudio(
  retentionDays = AUDIO_RETENTION_DAYS
): Promise<AudioBlobCleanupResult> {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer");
  }

  const todayMs = parseDateMs(getTodayBeijing());
  if (todayMs === null) {
    throw new Error("Unable to calculate audio retention cutoff date");
  }

  const cutoffMs = todayMs - (retentionDays - 1) * MS_PER_DAY;
  const cutoffDate = formatDate(cutoffMs);
  const deletedPathnames: string[] = [];
  let scanned = 0;
  let kept = 0;
  let skipped = 0;
  let cursor: string | undefined;

  do {
    const result = await list({
      prefix: AUDIO_BLOB_PREFIX,
      limit: 1000,
      cursor,
    });

    for (const blob of result.blobs) {
      scanned += 1;
      const blobDateMs = parseAudioBlobDateMs(blob.pathname);

      if (blobDateMs === null) {
        skipped += 1;
      } else if (blobDateMs < cutoffMs) {
        deletedPathnames.push(blob.pathname);
      } else {
        kept += 1;
      }
    }

    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);

  if (deletedPathnames.length > 0) {
    await del(deletedPathnames);
  }

  return {
    retentionDays,
    cutoffDate,
    scanned,
    kept,
    deleted: deletedPathnames.length,
    skipped,
    deletedPathnames,
  };
}

function parseAudioBlobDateMs(pathname: string): number | null {
  const match = pathname.match(AUDIO_DATE_PATH_RE);
  if (!match) return null;
  return parseDateMs(match[1]);
}

function parseDateMs(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isNaN(ms) ? null : ms;
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
