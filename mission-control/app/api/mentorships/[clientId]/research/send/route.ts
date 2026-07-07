import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { sendTelegramViaSharedSender } from "../../../../_telegram";

const WS = process.env.GET_SORTED_WORKSPACE || path.join(os.homedir(), "golden-claw");

const MENTORSHIPS_BASE = path.join(WS, "projects/mentorships");
const DB_PATH = path.join(MENTORSHIPS_BASE, "mentorships-db.json");

async function getClient(clientId: string) {
  const raw = await fs.readFile(DB_PATH, "utf-8");
  const db = JSON.parse(raw);
  return db.clients?.find((c: { id: string }) => c.id === clientId) ?? null;
}

async function getResearchContent(clientId: string, filename: string): Promise<string> {
  const raw = await fs.readFile(DB_PATH, "utf-8");
  const db = JSON.parse(raw);
  const client = db.clients?.find((c: { id: string; name: string }) => c.id === clientId);
  if (!client) throw new Error("Client not found");
  const folder = client.name.toUpperCase();
  const safeFile = path.basename(filename);
  const filePath = path.join(MENTORSHIPS_BASE, folder, "research", safeFile);
  return await fs.readFile(filePath, "utf-8");
}

function humanizeFilename(filename: string): string {
  return filename
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function generatePdf(content: string, clientId: string): Promise<string | null> {
  const tmpMd = `/tmp/research-${clientId}-${Date.now()}.md`;
  const pdfPath = `/tmp/research-${clientId}-${Date.now()}.pdf`;
  try {
    await fs.writeFile(tmpMd, content, "utf-8");
    // Try xelatex first, fall back to default engine
    try {
      execSync(`pandoc "${tmpMd}" -o "${pdfPath}" --pdf-engine=xelatex`, { timeout: 30000, stdio: "pipe" });
    } catch {
      execSync(`pandoc "${tmpMd}" -o "${pdfPath}"`, { timeout: 30000, stdio: "pipe" });
    }
    await fs.access(pdfPath);
    return pdfPath;
  } catch {
    return null;
  } finally {
    try { await fs.unlink(tmpMd); } catch {}
  }
}

// POST /api/mentorships/[clientId]/research/send
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const body = await request.json() as {
      filename: string;
      channel: "email" | "whatsapp" | "telegram";
      create_pdf: boolean;
    };
    const { filename, channel, create_pdf } = body;

    const client = await getClient(clientId);
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const content = await getResearchContent(clientId, filename);
    const title = humanizeFilename(filename);
    const firstName = (client.name as string).split(" ")[0];

    // --- EMAIL ---
    if (channel === "email") {
      const SENDER_EMAIL = process.env.MENTORSHIPS_SENDER_EMAIL;
      if (!SENDER_EMAIL) return NextResponse.json({ error: "MENTORSHIPS_SENDER_EMAIL is not configured" }, { status: 500 });
      const clientEmail = client.email as string | undefined;
      if (!clientEmail) return NextResponse.json({ error: "Client has no email address" }, { status: 400 });

      let attachArg = "";
      let pdfPath: string | null = null;

      if (create_pdf) {
        pdfPath = await generatePdf(content, clientId);
        if (pdfPath) attachArg = `--attach "${pdfPath}"`;
      }

      const subject = `${title} — ${client.name}`;
      const bodyText = create_pdf && pdfPath
        ? `Hi ${firstName},\n\nPlease find your research document "${title}" attached.\n\nJoe`
        : `Hi ${firstName},\n\nHere is the research document "${title}":\n\n${content}\n\nJoe`;

      execSync(
        `gog send --account "${SENDER_EMAIL}" --to "${clientEmail}" --subject "${subject.replace(/"/g, '\\"')}" --body "${bodyText.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}" ${attachArg} --force --no-input`,
        { timeout: 60000, stdio: "pipe" }
      );

      if (pdfPath) { try { await fs.unlink(pdfPath); } catch {} }

      return NextResponse.json({ ok: true, channel: "email", sent_to: clientEmail });
    }

    // --- WHATSAPP ---
    if (channel === "whatsapp") {
      const jid = client.whatsapp_jid as string | undefined;
      if (!jid) return NextResponse.json({ error: "Client has no WhatsApp configured" }, { status: 400 });

      if (create_pdf) {
        const pdfPath = await generatePdf(content, clientId);
        if (pdfPath) {
          const caption = `Hi ${firstName}! Here is your research document: ${title}`;
          execSync(
            `wacli send file --to "${jid}" --file "${pdfPath}" --filename "${title}.pdf" --caption "${caption.replace(/"/g, '\\"')}"`,
            { timeout: 60000, stdio: "pipe" }
          );
          try { await fs.unlink(pdfPath); } catch {}
        } else {
          // PDF failed — fall back to text
          const msg = `*${title}*\n\n${content}`;
          execSync(`wacli send message --to "${jid}" --message "${msg.replace(/"/g, '\\"')}"`, { timeout: 60000, stdio: "pipe" });
        }
      } else {
        const msg = `*${title}*\n\n${content}`;
        execSync(`wacli send message --to "${jid}" --message "${msg.replace(/"/g, '\\"')}"`, { timeout: 60000, stdio: "pipe" });
      }

      return NextResponse.json({ ok: true, channel: "whatsapp" });
    }

    // --- TELEGRAM ---
    if (channel === "telegram") {
      const chatId = client.telegram_chat_id as string | undefined;
      if (!chatId) return NextResponse.json({ error: "Client has no Telegram chat ID configured" }, { status: 400 });
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN is not configured" }, { status: 500 });

      if (create_pdf) {
        const pdfPath = await generatePdf(content, clientId);
        if (pdfPath) {
          const pdfBuf = await fs.readFile(pdfPath);
          const form = new FormData();
          form.append("chat_id", chatId);
          form.append("caption", `${title} — research document`);
          form.append("document", new Blob([pdfBuf], { type: "application/pdf" }), `${title}.pdf`);
          const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: "POST", body: form });
          if (!tgRes.ok) {
            const err = await tgRes.json();
            return NextResponse.json({ error: err.description || "Telegram error" }, { status: 500 });
          }
          try { await fs.unlink(pdfPath); } catch {}
        } else {
          // PDF failed — fall back to text
          const msg = `*${title}*\n\n${content.slice(0, 4000)}`;
          await sendTelegramViaSharedSender({
            botToken,
            chatId,
            text: msg,
            agentId: "mastermind-mentorships",
            messageType: "notification",
            sourcePath: "projects/mastermind-mission-control/mission-control/app/api/mentorships/[clientId]/research/send/route.ts",
          });
        }
      } else {
        const msg = `*${title}*\n\n${content.slice(0, 4000)}`;
        await sendTelegramViaSharedSender({
          botToken,
          chatId,
          text: msg,
          agentId: "mastermind-mentorships",
          messageType: "notification",
          sourcePath: "projects/mastermind-mission-control/mission-control/app/api/mentorships/[clientId]/research/send/route.ts",
        });
      }

      return NextResponse.json({ ok: true, channel: "telegram" });
    }

    return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
