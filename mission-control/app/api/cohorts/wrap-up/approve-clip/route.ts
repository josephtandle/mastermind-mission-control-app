// POST /api/cohorts/wrap-up/approve-clip
// Adds a clip to the instagram queue (or removes it if approved: false).
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";

const WS = process.env.GET_SORTED_WORKSPACE || path.join(os.homedir(), "golden-claw");

const MASTERMIND_BASE = `${WS}/projects/mastermind`;
const QUEUE_FILE = `${MASTERMIND_BASE}/instagram-queue.json`;

interface QueueEntry {
  file: string;
  session: unknown;
  cohort: number;
  speakerName: string;
  quote: string;
  surface?: "story" | "feed";
  approved: boolean;
  approvedAt: string;
  status: string;
}

interface QueueFile {
  storyQueue?: QueueEntry[];
  feedQueue?: QueueEntry[];
  storyPosted?: QueueEntry[];
  feedPosted?: QueueEntry[];
  queue?: QueueEntry[];
  posted?: QueueEntry[];
  settings: { postIntervalHours?: number; enabled?: boolean };
}

function normalizeQueueFile(queue: QueueFile): Required<Pick<QueueFile, "storyQueue" | "feedQueue" | "storyPosted" | "feedPosted">> & QueueFile {
  return {
    ...queue,
    storyQueue: Array.isArray(queue.storyQueue) ? queue.storyQueue : Array.isArray(queue.queue) ? queue.queue : [],
    feedQueue: Array.isArray(queue.feedQueue) ? queue.feedQueue : [],
    storyPosted: Array.isArray(queue.storyPosted) ? queue.storyPosted : [],
    feedPosted: Array.isArray(queue.feedPosted) ? queue.feedPosted : Array.isArray(queue.posted) ? queue.posted : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { file, session, cohort = 1, speakerName = "", quote = "", approved, surface = "story" } = body;
    const queueKey = surface === "feed" ? "feedQueue" : "storyQueue";
    const postedKey = surface === "feed" ? "feedPosted" : "storyPosted";

    if (!file || !session) {
      return NextResponse.json({ error: "file and session required" }, { status: 400 });
    }

    const q = normalizeQueueFile(fs.existsSync(QUEUE_FILE)
      ? (JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8")) as QueueFile)
      : { storyQueue: [], feedQueue: [], storyPosted: [], feedPosted: [], settings: { enabled: false } });

    if (approved) {
      // Add to queue if not already there and not already posted
      const alreadyPosted = q[postedKey].some(
        (e) => e.file === file && String(e.session) === String(session)
      );
      const alreadyQueued = q[queueKey].some(
        (e) => e.file === file && String(e.session) === String(session)
      );
      if (!alreadyPosted && !alreadyQueued) {
        q[queueKey].push({
          file,
          session,
          cohort,
          speakerName,
          quote,
          surface,
          approved: true,
          approvedAt: new Date().toISOString(),
          status: "queued",
        });
      }
    } else {
      // Remove from queue
      q[queueKey] = q[queueKey].filter(
        (e) => !(e.file === file && String(e.session) === String(session))
      );
    }

    fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
