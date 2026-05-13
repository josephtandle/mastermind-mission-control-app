import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { METRICS_PATH } from "../shared";

interface MetricEntry {
  sender: string;
  date: string;
  subject: string;
  platform: string;
  opens: string;
  clicks: string;
  notes: string;
}

export async function GET() {
  try {
    const content = await fs.readFile(METRICS_PATH, "utf8");
    const lines = content.trim().split("\n");

    if (lines.length <= 1) {
      return NextResponse.json({
        metrics: [],
        dailyStats: [],
        platformStats: [],
        message: "No metrics data available yet",
      });
    }

    const metrics: MetricEntry[] = lines.slice(1).map((line) => {
      const [sender, date, subject, platform, opens, clicks, notes] = line.split(",");
      return {
        sender: sender || "",
        date: date || "",
        subject: subject || "",
        platform: platform || "",
        opens: opens || "",
        clicks: clicks || "",
        notes: notes || "",
      };
    });

    const dailyMap = new Map<string, number>();
    for (const entry of metrics) {
      const dateOnly = entry.date.split(" ")[0];
      if (!dateOnly) continue;
      dailyMap.set(dateOnly, (dailyMap.get(dateOnly) || 0) + 1);
    }

    const platformMap = new Map<string, number>();
    for (const entry of metrics) {
      if (!entry.platform) continue;
      platformMap.set(entry.platform, (platformMap.get(entry.platform) || 0) + 1);
    }

    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    const platformStats = Array.from(platformMap.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      metrics: metrics.slice(0, 100),
      dailyStats,
      platformStats,
      totalEmails: metrics.length,
    });
  } catch {
    return NextResponse.json({
      metrics: [],
      dailyStats: [],
      platformStats: [],
      message: "No metrics data available yet",
    });
  }
}
