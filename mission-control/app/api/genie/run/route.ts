export const runtime = "nodejs";

import { execFileSync, execSync, spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { processes } from "../_state";

const SHARED_ROOT = path.join(process.env.HOME ?? "", ".openclaw", "workspace", "agents", "shared");
const { buildMyOSOperatorStartupContext } = require(path.join(SHARED_ROOT, "startup-context.js"));
const { myosRun } = require(path.join(SHARED_ROOT, "llm-call.js"));
const { readLaneState } = require(path.join(SHARED_ROOT, "myos-lane.js"));
const { readGeniePreferences } = require(path.join(SHARED_ROOT, "genie-preferences.js"));

type Slot = "A" | "B";

const WORKSPACE_ROOT = path.join(process.cwd(), "..");
const WORKSPACE_ENV_PATH = path.join(WORKSPACE_ROOT, ".env");
const WORKTREE_PATH = (() => {
  const candidate = process.env.ALLSORTED_APP_PATH;
  if (candidate && existsSync(candidate)) return candidate;
  return process.cwd();
})();

const MODEL_SELECTION: Record<string, Record<string, string>> = {
  openai: {
    haiku: "gpt-5",
    sonnet: "gpt-5",
    opus: "gpt-5",
    opusplan: "gpt-5",
    best: "gpt-5",
  },
  anthropic: {
    haiku: "claude-haiku-4-5",
    sonnet: "claude-sonnet-4-6",
    opus: "claude-opus-4-6",
    opusplan: "claude-opus-4-6",
    best: "claude-opus-4-6",
  },
};

const MODEL_MAX_TOKENS: Record<string, number> = {
  haiku: 200_000,
  sonnet: 400_000,
  opus: 400_000,
  opusplan: 400_000,
  best: 400_000,
};

function normalizeProvider(provider: string) {
  return provider === "anthropic" ? "anthropic" : "openai";
}

function readWorkspaceEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(WORKSPACE_ENV_PATH)) return env;

  for (const rawLine of readFileSync(WORKSPACE_ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) env[key] = value;
  }

  return env;
}

function resolveCodexBinary() {
  if (process.env.CODEX_BIN && existsSync(process.env.CODEX_BIN)) return process.env.CODEX_BIN;
  const candidates = ["/opt/homebrew/bin/codex", "/usr/local/bin/codex", "/usr/bin/codex"];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    return execFileSync("which", ["codex"], { stdio: "pipe" }).toString().trim();
  } catch {
    return "codex";
  }
}

function buildCommitLabel(prompt: string) {
  return prompt.slice(0, 60).replace(/['"\\]/g, "").trim() || "run";
}

function getHeadSha(cwd: string) {
  try {
    return execSync("git rev-parse HEAD", { cwd, stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

function getWorktreeStatus(cwd: string) {
  try {
    return execSync("git status --porcelain=v1 --untracked-files=all", { cwd, stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

function checkpointDirtyWorktree(prompt: string, cwd: string) {
  const status = getWorktreeStatus(cwd);
  if (status === null) {
    return { gitShaBefore: null as string | null, worktreeCleanBefore: 0, safeUndoCandidate: 0 };
  }

  if (!status) {
    return {
      gitShaBefore: getHeadSha(cwd),
      worktreeCleanBefore: 1,
      safeUndoCandidate: 1,
    };
  }

  try {
    const label = buildCommitLabel(prompt);
    execSync(`git add -A && git commit -m "checkpoint(genie): before ${label}"`, {
      cwd,
      stdio: "pipe",
    });
    return {
      gitShaBefore: getHeadSha(cwd),
      worktreeCleanBefore: 0,
      safeUndoCandidate: 1,
    };
  } catch {
    return {
      gitShaBefore: getHeadSha(cwd),
      worktreeCleanBefore: 0,
      safeUndoCandidate: 0,
    };
  }
}

function buildPromptForMode(prompt: string, mode: string) {
  const planPrefix =
    "Before making any changes, write out a detailed step-by-step plan of everything you would do, including which files you would modify and why. Do NOT make any changes yet — just write the plan.\n\n";
  const readOnlyPrefix =
    "IMPORTANT: You are in Read Only mode. You may analyze and recommend changes, but you MUST NOT imply that you edited files or executed commands.\n\n";

  if (mode === "plan-first") return planPrefix + prompt;
  if (mode === "read-only") return readOnlyPrefix + prompt;
  return prompt;
}

function buildGenieSystemPrompt() {
  return [
    "You are Genie running through Mission Control as a terminal-backed coding agent.",
    "Follow the same session rules, breadcrumbs, context files, and startup contract used by Uni, Claude, and Codex on this build.",
    "Work directly in the local filesystem and shell when the task requires it.",
    "Be concise, practical, and explicit about assumptions.",
    "When the user asks you to store or move files, first resolve the correct destination from breadcrumbs, AGENTS.md, USER.md, MEMORY.md, projects/_index.json, and other workspace context before writing anything.",
    "Never save user assets in app/, app/api/, route folders, or source-code directories unless the user explicitly asked for that exact destination.",
    "For personal photos or personal documents, prefer the user's real project/data/personal folders over the current route directory.",
    "When answering questions, lead with the direct answer in plain English.",
    "The first line should be a short human-readable answer, not a transcript.",
    "If the user asks where you put something, answer with the exact destination path in one short sentence, then optionally one short supporting sentence.",
    "If there is supporting detail, put it under a separate heading exactly named: Supporting information:",
    "Keep responses human-readable. Summarize supporting details instead of dumping raw evidence unless the user asks for it.",
    "If tool output matters, give the conclusion first and keep supporting information brief and clearly secondary.",
    "Example good answer: Last 30 days of Stripe payments are GBP 13,681.07.",
    buildMyOSOperatorStartupContext(),
  ].join("\n\n");
}

function splitAnswerAndSupporting(text: string) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return { answer: "", supporting: "" };
  }

  const explicitSupportingMatch = normalized.match(/\n+Supporting information:\s*/i);
  if (explicitSupportingMatch && explicitSupportingMatch.index != null) {
    const index = explicitSupportingMatch.index;
    return {
      answer: normalized.slice(0, index).trim(),
      supporting: normalized.slice(index).trim(),
    };
  }

  const toolTagIndex = normalized.search(/<tool_call>|<tool_response>/i);
  if (toolTagIndex !== -1) {
    return {
      answer: normalized.slice(0, toolTagIndex).trim(),
      supporting: normalized.slice(toolTagIndex).trim(),
    };
  }

  return { answer: normalized, supporting: "" };
}

function enqueueStructuredAnswer(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  text: string
) {
  const { answer, supporting } = splitAnswerAndSupporting(text);

  if (answer) {
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify({ type: "answer", answer })}\n\n`)
    );
  }

  if (supporting) {
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: "supporting_information", content: supporting })}\n\n`
      )
    );
  }
}

function buildCodexArgs({
  model,
  effort,
  sessionId,
}: {
  model: string;
  effort: string;
  sessionId?: string | null;
}) {
  const args = ["exec"];
  if (sessionId) args.push("resume");
  args.push("--json", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox");
  if (!sessionId) args.push("-C", WORKTREE_PATH);
  if (model) args.push("-m", model);
  args.push("-c", `model_reasoning_effort=${JSON.stringify(effort)}`);
  if (sessionId) args.push(sessionId);
  args.push("-");
  return args;
}

function maybeCommitChanges(prompt: string, cwd: string) {
  const status = getWorktreeStatus(cwd);
  if (!status) {
    return { runCommitSha: null as string | null, safeUndoAvailable: 0 };
  }

  try {
    const shortPrompt = buildCommitLabel(prompt);
    execSync(`git add -A && git commit -m "genie: ${shortPrompt}"`, {
      cwd,
      stdio: "pipe",
    });
    return {
      runCommitSha: getHeadSha(cwd),
      safeUndoAvailable: 1,
    };
  } catch {
    return { runCommitSha: null as string | null, safeUndoAvailable: 0 };
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const savedPreferences = readGeniePreferences();
  const laneState = readLaneState();
  const {
    prompt,
    model = savedPreferences.model,
    effort = savedPreferences.effort,
    mode = savedPreferences.mode,
    sessionId,
    slot = "A",
    provider = savedPreferences.provider || laneState.apiProvider || "anthropic",
  } = body as {
    prompt: string;
    model?: string;
    effort?: string;
    mode?: string;
    sessionId?: string;
    slot?: Slot;
    provider?: string;
  };

  if (!prompt?.trim()) {
    return new Response(JSON.stringify({ error: "prompt is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const slotKey = (slot === "B" ? "B" : "A") as Slot;
  const existing = processes.get(slotKey);
  if (existing && existing.exitCode === null) {
    return new Response(JSON.stringify({ error: `Slot ${slotKey} is already running` }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const activeCount = [...processes.values()].filter((handle) => handle.exitCode === null).length;
  if (activeCount >= 2 && !processes.has(slotKey)) {
    return new Response(JSON.stringify({ error: "Both terminal slots are busy. Stop a session first." }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalizedProvider = normalizeProvider(provider);
  const requestedModel =
    MODEL_SELECTION[normalizedProvider]?.[model] ||
    MODEL_SELECTION[normalizedProvider]?.sonnet ||
    (normalizedProvider === "anthropic" ? "claude-sonnet-4-6" : "gpt-5");
  const maxContext = MODEL_MAX_TOKENS[model] ?? 400_000;
  const finalPrompt = buildPromptForMode(prompt, mode);

  const canCheckpointBeforeRun = mode !== "plan-first" && mode !== "read-only";
  const preRunState = canCheckpointBeforeRun
    ? checkpointDirtyWorktree(prompt, WORKTREE_PATH)
    : {
        gitShaBefore: getHeadSha(WORKTREE_PATH),
        worktreeCleanBefore: getWorktreeStatus(WORKTREE_PATH) ? 0 : 1,
        safeUndoCandidate: 0,
      };
  const gitShaBefore = preRunState.gitShaBefore;

  const encoder = new TextEncoder();
  const workspaceEnv = readWorkspaceEnv();

  const stream = new ReadableStream({
    async start(controller) {
      const meta = JSON.stringify({
        type: "meta",
        slot: slotKey,
        maxContext,
        cwd: WORKTREE_PATH,
        gitShaBefore,
        worktreeCleanBefore: preRunState.worktreeCleanBefore,
        safeUndoCandidate: preRunState.safeUndoCandidate,
        provider: normalizedProvider,
        runner: normalizedProvider === "anthropic" ? "myos_api" : "codex_exec",
      });
      controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

      if (normalizedProvider === "anthropic") {
        let cancelled = false;
        const handle = {
          exitCode: null as number | null,
          kill: () => {
            cancelled = true;
            handle.exitCode = 143;
          },
        };
        processes.set(slotKey, handle as any);

        try {
          const result = await myosRun({
            executionPolicy: "internal_automation",
            providerPreference: "anthropic",
            taskClass: mode === "plan-first" ? "planning" : "general",
            caller: {
              agentId: "mission-control",
              surface: "mission-control",
              project: "mission-control",
              runId: slotKey,
              traceId: slotKey,
              authLabel: "mission-control-openai",
            },
            prompt: finalPrompt,
            systemPrompt: buildGenieSystemPrompt(),
            model: requestedModel,
            maxOutputTokens: effort === "max" ? 6000 : effort === "high" ? 5000 : 3500,
            timeoutMs: 180000,
            budgetCapUsd: mode === "plan-first" ? 0.2 : 1.5,
            responseMode: "text",
          });

          if (!cancelled) {
            enqueueStructuredAnswer(controller, encoder, result.text);
            const assistantEvent = JSON.stringify({
              type: "assistant",
              message: {
                content: [],
                usage: {
                  input_tokens: result.usage.inputTokens,
                  output_tokens: result.usage.outputTokens,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0,
                },
              },
            });
            controller.enqueue(encoder.encode(`data: ${assistantEvent}\n\n`));

            const resultEvent = JSON.stringify({
              type: "result",
              result: result.text,
              total_cost_usd: result.estimatedCostUsd,
              provider: result.provider,
              model: result.model,
            });
            controller.enqueue(encoder.encode(`data: ${resultEvent}\n\n`));
          }

          handle.exitCode = handle.exitCode ?? 0;
        } catch (error) {
          handle.exitCode = handle.exitCode ?? 1;
          if (!cancelled) {
            const message = JSON.stringify({
              type: "error",
              message: error instanceof Error ? error.message : "Anthropic API execution failed",
            });
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));
          }
        } finally {
          let runCommitSha: string | null = null;
          let safeUndoAvailable = 0;
          if (!cancelled && mode !== "plan-first" && mode !== "read-only") {
            const commitResult = maybeCommitChanges(prompt, WORKTREE_PATH);
            runCommitSha = commitResult.runCommitSha;
            safeUndoAvailable = commitResult.safeUndoAvailable;
          }

          const done = JSON.stringify({
            type: "done",
            exitCode: handle.exitCode ?? 0,
            provider: normalizedProvider,
            runner: "myos_api",
            safe_undo_available: safeUndoAvailable,
            worktree_clean_before: preRunState.worktreeCleanBefore,
            run_commit_sha: runCommitSha,
          });
          controller.enqueue(encoder.encode(`data: ${done}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          processes.delete(slotKey);
        }
        return;
      }

      const command = resolveCodexBinary();
      const args = buildCodexArgs({ model: requestedModel, effort, sessionId });
      const child = spawn(command, args, {
        cwd: WORKTREE_PATH,
        env: {
          ...process.env,
          ...workspaceEnv,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      processes.set(slotKey, child);

      let stdoutBuffer = "";
      let finalSessionId: string | null = sessionId ?? null;

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.type === "thread.started" && typeof parsed.thread_id === "string") {
              finalSessionId = parsed.thread_id;
              controller.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
              continue;
            }

            if (parsed.type === "item.completed" && parsed.item?.type === "agent_message") {
              const text = String(parsed.item?.text ?? "").trim();
              if (text) {
                enqueueStructuredAnswer(controller, encoder, text);
              }
              continue;
            }

            if (parsed.type === "assistant" && Array.isArray(parsed.message?.content)) {
              const text = parsed.message.content
                .filter((block: { type?: string; text?: string }) => block?.type === "text" && typeof block?.text === "string")
                .map((block: { text?: string }) => block.text || "")
                .join("\n")
                .trim();

              if (text) {
                enqueueStructuredAnswer(controller, encoder, text);
              }

              const usageOnlyEvent = JSON.stringify({
                ...parsed,
                message: {
                  ...(parsed.message || {}),
                  content: [],
                },
              });
              controller.enqueue(encoder.encode(`data: ${usageOnlyEvent}\n\n`));
              continue;
            }
          } catch {
            // Ignore invalid JSON lines; still stream them through.
          }
          controller.enqueue(encoder.encode(`data: ${trimmed}\n\n`));
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const message = chunk.toString().trim();
        if (!message) return;
        const errorEvent = JSON.stringify({
          type: "error",
          message,
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
      });

      child.on("close", (code) => {
        if (stdoutBuffer.trim()) {
          try {
            const parsed = JSON.parse(stdoutBuffer.trim());
            if (parsed.type === "thread.started" && typeof parsed.thread_id === "string") {
              finalSessionId = parsed.thread_id;
            }
          } catch {
            // Ignore invalid JSON lines.
          }
          controller.enqueue(encoder.encode(`data: ${stdoutBuffer.trim()}\n\n`));
        }

        let runCommitSha: string | null = null;
        let safeUndoAvailable = 0;
        if ((code ?? 0) === 0 && mode !== "plan-first" && mode !== "read-only") {
          const commitResult = maybeCommitChanges(prompt, WORKTREE_PATH);
          runCommitSha = commitResult.runCommitSha;
          safeUndoAvailable = commitResult.safeUndoAvailable;
        }

        const done = JSON.stringify({
          type: "done",
          exitCode: code ?? 0,
          session_id: finalSessionId,
          provider: normalizedProvider,
          runner: "codex_exec",
          safe_undo_available: safeUndoAvailable,
          worktree_clean_before: preRunState.worktreeCleanBefore,
          run_commit_sha: runCommitSha,
        });
        controller.enqueue(encoder.encode(`data: ${done}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        processes.delete(slotKey);
      });

      child.on("error", (err) => {
        const errorEvent = JSON.stringify({
          type: "error",
          message: `Failed to start codex: ${err.message}`,
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        const done = JSON.stringify({
          type: "done",
          exitCode: 1,
          provider: normalizedProvider,
          runner: "codex_exec",
          safe_undo_available: 0,
          worktree_clean_before: preRunState.worktreeCleanBefore,
          run_commit_sha: null,
        });
        controller.enqueue(encoder.encode(`data: ${done}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        processes.delete(slotKey);
      });

      child.stdin.write(`${finalPrompt}\n`);
      child.stdin.end();
    },
    cancel() {
      const child = processes.get(slotKey);
      if (child) {
        child.kill("SIGTERM");
        processes.delete(slotKey);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Slot": slotKey,
    },
  });
}
