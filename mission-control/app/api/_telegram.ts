import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type SendTelegramOptions = {
  botToken: string;
  chatId: string;
  text: string;
  agentId: string;
  messageType?: string;
  sourcePath: string;
  plainText?: boolean;
};

export async function sendTelegramViaSharedSender(options: SendTelegramOptions): Promise<void> {
  const cliPath = path.join(os.homedir(), ".myos/workspace/agents/shared/send-telegram-cli.js");
  const args = [
    cliPath,
    "--agent-id", options.agentId,
    "--message-type", options.messageType || "notification",
    "--source-path", options.sourcePath,
    "--text", options.text,
  ];
  if (options.plainText) args.push("--plain-text");

  await execFileAsync("node", args, {
    env: {
      ...process.env,
      TELEGRAM_BOT_TOKEN: options.botToken,
      TELEGRAM_CHAT_ID: options.chatId,
    },
    timeout: 30000,
  });
}
