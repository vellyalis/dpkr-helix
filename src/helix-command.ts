import { existsSync, statSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import type { RegisteredProject } from "./projects/project-types.js";
import {
  formatWorkspaceHandoffForPrompt,
  type WorkspaceHandoff,
} from "./workspace-handoff-store.js";

export type HelixCommand =
  | "codex"
  | "continue"
  | "resume"
  | "projects"
  | "up"
  | "down"
  | "restart"
  | "recover"
  | "status"
  | "doctor"
  | "dashboard"
  | "update"
  | "help"
  | "version";

export interface ParsedHelixCommand {
  command: HelixCommand;
  selector?: string;
  passthrough: string[];
}

export interface LauncherTarget {
  root: string;
  project?: RegisteredProject;
}

export interface ExecutableInvocation {
  command: string;
  prefixArgs: string[];
}

export interface CodexLaunchPlan {
  command: string;
  args: string[];
  cwd: string;
  label: string;
}

const COMMAND_ALIASES = new Map<string, HelixCommand>([
  ["start", "up"],
  ["stop", "down"],
  ["ls", "projects"],
  ["handoff", "continue"],
]);

export function parseHelixArgs(argv: readonly string[]): ParsedHelixCommand {
  if (argv.length === 0) {
    return { command: "codex", passthrough: [] };
  }

  const [first, ...rest] = argv;
  if (first === "--help" || first === "-h" || first === "help") {
    return { command: "help", passthrough: [] };
  }
  if (first === "--version" || first === "-v" || first === "version") {
    return { command: "version", passthrough: [] };
  }

  const normalized = COMMAND_ALIASES.get(first) ?? first;
  if (isHelixCommand(normalized)) {
    if (
      normalized === "codex"
      || normalized === "continue"
      || normalized === "resume"
    ) {
      return parseTargetCommand(normalized, rest);
    }
    return { command: normalized, passthrough: rest };
  }

  if (first.startsWith("-")) {
    return { command: "codex", passthrough: [...argv] };
  }

  return {
    command: "codex",
    selector: first,
    passthrough: stripLeadingSeparator(rest),
  };
}

export function buildHandoffPrompt(handoff: WorkspaceHandoff): string {
  return [
    "Continue this project from the dpkr helix persistent handoff below.",
    "Reconcile the handoff with Git, current files, configuration, and current test evidence before changing anything.",
    "Follow the repository's AGENTS.md and other local instructions normally.",
    "",
    formatWorkspaceHandoffForPrompt(handoff),
  ].join("\n");
}

export function buildCodexLaunchPlan(
  invocation: ExecutableInvocation,
  parsed: ParsedHelixCommand,
  target: LauncherTarget,
  handoff?: WorkspaceHandoff,
): CodexLaunchPlan {
  const label = target.project?.name ?? (basename(target.root) || target.root);
  const targetArgs = ["-C", target.root];

  if (parsed.command === "codex") {
    return {
      command: invocation.command,
      args: [...invocation.prefixArgs, ...targetArgs, ...parsed.passthrough],
      cwd: target.root,
      label,
    };
  }

  if (parsed.command === "continue") {
    if (!handoff) {
      throw new Error(
        `No persistent dpkr helix handoff exists for ${label}. Start a normal session with: helix ${target.project?.slug ?? "."}`,
      );
    }
    return {
      command: invocation.command,
      args: [
        ...invocation.prefixArgs,
        ...targetArgs,
        ...parsed.passthrough,
        buildHandoffPrompt(handoff),
      ],
      cwd: target.root,
      label,
    };
  }

  if (parsed.command === "resume") {
    const picker = parsed.passthrough.includes("--picker");
    const forwarded = parsed.passthrough.filter((entry) => entry !== "--picker");
    return {
      command: invocation.command,
      args: [
        ...invocation.prefixArgs,
        "resume",
        ...targetArgs,
        ...(picker ? [] : ["--last"]),
        ...forwarded,
      ],
      cwd: target.root,
      label,
    };
  }

  throw new Error(`Command does not launch Codex: ${parsed.command}`);
}

export function findCodexInvocation(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ExecutableInvocation {
  const pathEntries = (env.PATH ?? env.Path ?? "")
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    if (localAppData) {
      pathEntries.unshift(join(localAppData, "Programs", "OpenAI", "Codex", "bin"));
    }

    for (const entry of pathEntries) {
      const executable = join(entry, "codex.exe");
      if (isFile(executable)) {
        return { command: executable, prefixArgs: [] };
      }
    }

    for (const entry of pathEntries) {
      const shim = join(entry, "codex.cmd");
      if (!isFile(shim)) continue;
      const script = join(entry, "node_modules", "@openai", "codex", "bin", "codex.js");
      if (isFile(script)) {
        return { command: process.execPath, prefixArgs: [script] };
      }
    }

    throw new Error(
      "Official Codex CLI was not found. Install or update Codex, then run `codex login` with your ChatGPT account.",
    );
  }

  for (const entry of pathEntries) {
    const executable = join(entry, "codex");
    if (isFile(executable)) {
      return { command: executable, prefixArgs: [] };
    }
  }
  throw new Error(
    "Official Codex CLI was not found. Install Codex, then run `codex login` with your ChatGPT account.",
  );
}

function parseTargetCommand(
  command: "codex" | "continue" | "resume",
  args: readonly string[],
): ParsedHelixCommand {
  const separator = args.indexOf("--");
  const before = separator >= 0 ? [...args.slice(0, separator)] : [...args];
  const after = separator >= 0 ? [...args.slice(separator + 1)] : [];
  const selector = before[0] && !before[0].startsWith("-") ? before.shift() : undefined;
  return {
    command,
    selector,
    passthrough: [...before, ...after],
  };
}

function stripLeadingSeparator(args: readonly string[]): string[] {
  return args[0] === "--" ? [...args.slice(1)] : [...args];
}

function isHelixCommand(value: string): value is HelixCommand {
  return [
    "codex",
    "continue",
    "resume",
    "projects",
    "up",
    "down",
    "restart",
    "recover",
    "status",
    "doctor",
    "dashboard",
    "update",
    "help",
    "version",
  ].includes(value);
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}
