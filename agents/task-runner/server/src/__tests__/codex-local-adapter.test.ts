import { describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isCodexUnknownSessionError, parseCodexJsonl } from "@paperclipai/adapter-codex-local/server";
import { execute } from "@paperclipai/adapter-codex-local/server";
import { parseCodexStdoutLine } from "@paperclipai/adapter-codex-local/ui";
import { printCodexStreamEvent } from "@paperclipai/adapter-codex-local/cli";

async function writeFakeCodexCommand(commandPath: string): Promise<void> {
  const script = `#!/usr/bin/env node
const fs = require("node:fs");

const capturePath = process.env.PAPERCLIP_TEST_CAPTURE_PATH;
const payload = {
  argv: process.argv.slice(2),
  prompt: fs.readFileSync(0, "utf8"),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  myosCodexAuthLane: process.env.MYOS_CODEX_AUTH_LANE || "",
};
if (capturePath) {
  fs.writeFileSync(capturePath, JSON.stringify(payload), "utf8");
}
console.log(JSON.stringify({ type: "thread.started", thread_id: "codex-session-1" }));
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "hello" } }));
console.log(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }));
`;
  await fs.writeFile(commandPath, script, "utf8");
  await fs.chmod(commandPath, 0o755);
}

describe("codex_local parser", () => {
  it("extracts session, summary, usage, and terminal error message", () => {
    const stdout = [
      JSON.stringify({ type: "thread.started", thread_id: "thread-123" }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "hello" } }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 } }),
      JSON.stringify({ type: "turn.failed", error: { message: "model access denied" } }),
    ].join("\n");

    const parsed = parseCodexJsonl(stdout);
    expect(parsed.sessionId).toBe("thread-123");
    expect(parsed.summary).toBe("hello");
    expect(parsed.usage).toEqual({
      inputTokens: 10,
      cachedInputTokens: 2,
      outputTokens: 4,
    });
    expect(parsed.errorMessage).toBe("model access denied");
  });
});

describe("codex_local execute", () => {
  it("marks programmatic Codex runs as API lane when OPENAI_API_KEY is inherited from the task runner", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-codex-execute-api-"));
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "codex");
    const capturePath = path.join(root, "capture.json");
    const previousOpenAI = process.env.OPENAI_API_KEY;
    await fs.mkdir(workspace, { recursive: true });
    await writeFakeCodexCommand(commandPath);

    process.env.OPENAI_API_KEY = "test-host-openai-key";

    try {
      const result = await execute({
        runId: "run-1",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "Codex Agent",
          adapterType: "codex_local",
          adapterConfig: {},
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        config: {
          command: commandPath,
          cwd: workspace,
          model: "gpt-5.5",
          env: {
            PAPERCLIP_TEST_CAPTURE_PATH: capturePath,
          },
          promptTemplate: "Run the task.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.errorMessage).toBeNull();
      expect(result.billingType).toBe("api");

      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as {
        argv: string[];
        openaiApiKey: string;
        myosCodexAuthLane: string;
      };
      expect(capture.argv).toContain("--model");
      expect(capture.argv).toContain("gpt-5.3-codex");
      expect(capture.openaiApiKey).toBe("test-host-openai-key");
      expect(capture.myosCodexAuthLane).toBe("api");
    } finally {
      if (previousOpenAI === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAI;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("reports the actual executed model when extraArgs supplies the final model override", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-codex-execute-extra-"));
    const workspace = path.join(root, "workspace");
    const commandPath = path.join(root, "codex");
    const capturePath = path.join(root, "capture.json");
    const previousOpenAI = process.env.OPENAI_API_KEY;
    await fs.mkdir(workspace, { recursive: true });
    await writeFakeCodexCommand(commandPath);

    process.env.OPENAI_API_KEY = "test-host-openai-key";

    try {
      const result = await execute({
        runId: "run-2",
        agent: {
          id: "agent-1",
          companyId: "company-1",
          name: "Codex Agent",
          adapterType: "codex_local",
          adapterConfig: {},
        },
        runtime: {
          sessionId: null,
          sessionParams: null,
          sessionDisplayId: null,
          taskKey: null,
        },
        config: {
          command: commandPath,
          cwd: workspace,
          env: {
            PAPERCLIP_TEST_CAPTURE_PATH: capturePath,
          },
          extraArgs: ["--model", "gpt-5.5"],
          promptTemplate: "Run the task.",
        },
        context: {},
        authToken: "run-jwt-token",
        onLog: async () => {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.model).toBe("gpt-5.3-codex");

      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as {
        argv: string[];
      };
      expect(capture.argv).toContain("gpt-5.3-codex");
      expect(capture.argv).not.toContain("gpt-5.5");
    } finally {
      if (previousOpenAI === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAI;
      }
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("codex_local stale session detection", () => {
  it("treats missing rollout path as an unknown session error", () => {
    const stderr =
      "2026-02-19T19:58:53.281939Z ERROR codex_core::rollout::list: state db missing rollout path for thread 019c775d-967c-7ef1-acc7-e396dc2c87cc";

    expect(isCodexUnknownSessionError("", stderr)).toBe(true);
  });
});

describe("codex_local ui stdout parser", () => {
  it("parses turn and reasoning lifecycle events", () => {
    const ts = "2026-02-20T00:00:00.000Z";

    expect(parseCodexStdoutLine(JSON.stringify({ type: "turn.started" }), ts)).toEqual([
      { kind: "system", ts, text: "turn started" },
    ]);

    expect(
      parseCodexStdoutLine(
        JSON.stringify({
          type: "item.completed",
          item: { id: "item_1", type: "reasoning", text: "**Preparing to use paperclip skill**" },
        }),
        ts,
      ),
    ).toEqual([
      { kind: "thinking", ts, text: "**Preparing to use paperclip skill**" },
    ]);
  });

  it("parses command execution and file changes", () => {
    const ts = "2026-02-20T00:00:00.000Z";

    expect(
      parseCodexStdoutLine(
        JSON.stringify({
          type: "item.started",
          item: { id: "item_2", type: "command_execution", command: "/bin/zsh -lc ls", status: "in_progress" },
        }),
        ts,
      ),
    ).toEqual([
      {
        kind: "tool_call",
        ts,
        name: "command_execution",
        input: { id: "item_2", command: "/bin/zsh -lc ls" },
      },
    ]);

    expect(
      parseCodexStdoutLine(
        JSON.stringify({
          type: "item.completed",
          item: {
            id: "item_2",
            type: "command_execution",
            command: "/bin/zsh -lc ls",
            aggregated_output: "agents\n",
            exit_code: 0,
            status: "completed",
          },
        }),
        ts,
      ),
    ).toEqual([
      {
        kind: "tool_result",
        ts,
        toolUseId: "item_2",
        content: "command: /bin/zsh -lc ls\nstatus: completed\nexit_code: 0\n\nagents",
        isError: false,
      },
    ]);

    expect(
      parseCodexStdoutLine(
        JSON.stringify({
          type: "item.completed",
          item: {
            id: "item_52",
            type: "file_change",
            changes: [{ path: "/home/user/project/ui/src/pages/AgentDetail.tsx", kind: "update" }],
            status: "completed",
          },
        }),
        ts,
      ),
    ).toEqual([
      {
        kind: "system",
        ts,
        text: "file changes: update /home/user/project/ui/src/pages/AgentDetail.tsx",
      },
    ]);
  });

  it("parses error items and failed turns", () => {
    const ts = "2026-02-20T00:00:00.000Z";

    expect(
      parseCodexStdoutLine(
        JSON.stringify({
          type: "item.completed",
          item: {
            id: "item_0",
            type: "error",
            message: "This session was recorded with model `gpt-5.2-pro` but is resuming with `gpt-5.2-codex`.",
          },
        }),
        ts,
      ),
    ).toEqual([
      {
        kind: "stderr",
        ts,
        text: "This session was recorded with model `gpt-5.2-pro` but is resuming with `gpt-5.2-codex`.",
      },
    ]);

    expect(
      parseCodexStdoutLine(
        JSON.stringify({
          type: "turn.failed",
          error: { message: "model access denied" },
          usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 },
        }),
        ts,
      ),
    ).toEqual([
      {
        kind: "result",
        ts,
        text: "",
        inputTokens: 10,
        outputTokens: 4,
        cachedTokens: 2,
        costUsd: 0,
        subtype: "turn.failed",
        isError: true,
        errors: ["model access denied"],
      },
    ]);
  });
});

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("codex_local cli formatter", () => {
  it("prints lifecycle, command execution, file change, and error events", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      printCodexStreamEvent(JSON.stringify({ type: "turn.started" }), false);
      printCodexStreamEvent(
        JSON.stringify({
          type: "item.started",
          item: { id: "item_2", type: "command_execution", command: "/bin/zsh -lc ls", status: "in_progress" },
        }),
        false,
      );
      printCodexStreamEvent(
        JSON.stringify({
          type: "item.completed",
          item: {
            id: "item_2",
            type: "command_execution",
            command: "/bin/zsh -lc ls",
            aggregated_output: "agents\n",
            exit_code: 0,
            status: "completed",
          },
        }),
        false,
      );
      printCodexStreamEvent(
        JSON.stringify({
          type: "item.completed",
          item: {
            id: "item_52",
            type: "file_change",
            changes: [{ path: "/home/user/project/ui/src/pages/AgentDetail.tsx", kind: "update" }],
            status: "completed",
          },
        }),
        false,
      );
      printCodexStreamEvent(
        JSON.stringify({
          type: "turn.failed",
          error: { message: "model access denied" },
          usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 4 },
        }),
        false,
      );
      printCodexStreamEvent(
        JSON.stringify({
          type: "item.completed",
          item: { type: "error", message: "resume model mismatch" },
        }),
        false,
      );

      const lines = spy.mock.calls
        .map((call) => call.map((v) => String(v)).join(" "))
        .map(stripAnsi);

      expect(lines).toEqual(expect.arrayContaining([
        "turn started",
        "tool_call: command_execution",
        "/bin/zsh -lc ls",
        "tool_result: command_execution command=\"/bin/zsh -lc ls\" status=completed exit_code=0",
        "agents",
        "file_change: update /home/user/project/ui/src/pages/AgentDetail.tsx",
        "turn failed: model access denied",
        "tokens: in=10 out=4 cached=2",
        "error: resume model mismatch",
      ]));
    } finally {
      spy.mockRestore();
    }
  });
});
