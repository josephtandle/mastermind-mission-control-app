import { spawnSync } from "child_process";

export type PythonInvocation = {
  command: string;
  prefixArgs: string[];
};

export function resolvePythonInvocation(): PythonInvocation | null {
  const candidates: PythonInvocation[] = process.platform === "win32"
    ? [
        { command: "python", prefixArgs: [] },
        { command: "python3", prefixArgs: [] },
        { command: "py", prefixArgs: ["-3"] },
      ]
    : [
        { command: "python3", prefixArgs: [] },
        { command: "python", prefixArgs: [] },
      ];

  for (const candidate of candidates) {
    const result = spawnSync(
      candidate.command,
      [
        ...candidate.prefixArgs,
        "-c",
        "import sys; raise SystemExit(0 if sys.version_info.major == 3 else 1)",
      ],
      { stdio: "ignore", env: process.env }
    );
    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
}
