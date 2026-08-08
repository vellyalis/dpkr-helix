import { spawnSync } from "node:child_process";
import { delimiter, resolve } from "node:path";
import { removeDevspaceNodeModulesBinFromPath } from "./local-agent-path.js";
import {
  findActiveLocalAgentProviderCooldown,
  LocalAgentFailure,
  type LocalAgentFailureCode,
} from "./local-agent-failure.js";
import {
  LOCAL_AGENT_PROVIDERS,
  type LocalAgentProvider,
} from "./local-agent-profiles.js";
import type { LocalAgentRecord } from "./local-agent-store.js";

export interface LocalAgentProviderAvailability {
  name: LocalAgentProvider;
  available: boolean;
  state: "available" | "unavailable" | "cooldown";
  reason?: string;
  failureCode?: LocalAgentFailureCode;
  retryAt?: string;
  sourceAgentId?: string;
}

export function getLocalAgentProviderAvailabilitySnapshot(
  env: NodeJS.ProcessEnv = process.env,
  records: readonly LocalAgentRecord[] = [],
  now = Date.now(),
): LocalAgentProviderAvailability[] {
  return LOCAL_AGENT_PROVIDERS.map((provider) =>
    checkLocalAgentProviderAvailability(provider, env, records, now)
  );
}

export function checkLocalAgentProviderAvailability(
  provider: LocalAgentProvider,
  env: NodeJS.ProcessEnv = process.env,
  records: readonly LocalAgentRecord[] = [],
  now = Date.now(),
): LocalAgentProviderAvailability {
  let physical: LocalAgentProviderAvailability;
  switch (provider) {
    case "codex":
      physical = packageAvailability(provider, "@openai/codex-sdk");
      break;
    case "claude":
      physical = packageAvailability(provider, "@anthropic-ai/claude-agent-sdk");
      break;
    case "opencode":
      physical = packageAvailability(provider, "@opencode-ai/sdk/v2");
      break;
    case "pi":
      physical = commandAvailability(provider, env.PI_COMMAND ?? "pi", {
        env: piAvailabilityEnvironment(env),
      });
      break;
    case "cursor":
      physical = commandAvailability(provider, "cursor-agent");
      break;
    case "copilot":
      physical = commandAvailability(provider, "copilot");
      break;
  }
  if (!physical.available) return physical;

  const cooldown = findActiveLocalAgentProviderCooldown(records, provider, now);
  if (!cooldown) return physical;
  return {
    name: provider,
    available: false,
    state: "cooldown",
    reason: cooldown.failureCode === "usage_limit"
      ? "Provider usage limit is active."
      : "Provider rate limit is active.",
    failureCode: cooldown.failureCode,
    retryAt: cooldown.retryAt,
    sourceAgentId: cooldown.sourceAgentId,
  };
}

export function assertLocalAgentProviderAvailable(
  provider: LocalAgentProvider,
  env: NodeJS.ProcessEnv = process.env,
  records: readonly LocalAgentRecord[] = [],
  now = Date.now(),
): void {
  const availability = checkLocalAgentProviderAvailability(provider, env, records, now);
  if (availability.available) return;
  if (availability.state === "cooldown") {
    const retry = availability.retryAt ? ` Retry after ${availability.retryAt}.` : "";
    const reason = (availability.reason ?? "Cooldown active").replace(/[.!?]+$/, "");
    throw new LocalAgentFailure(
      availability.failureCode ?? "rate_limited",
      `${provider} provider is temporarily unavailable: ${reason}.${retry} Helix will not switch providers automatically; choose another configured provider or profile explicitly, or retry later.`,
      {
        provider,
        retryAt: availability.retryAt,
      },
    );
  }
  throw new Error(
    `${provider} provider is not available: ${availability.reason ?? "provider preflight failed"}`,
  );
}

export function formatLocalAgentProviderAvailabilitySummary(
  providers: LocalAgentProviderAvailability[],
): string {
  const available = providers
    .filter((provider) => provider.available)
    .map((provider) => provider.name);
  const unavailable = providers
    .filter((provider) => !provider.available && provider.state !== "cooldown")
    .map((provider) => `${provider.name} (${provider.reason ?? "unavailable"})`);
  const cooldown = providers
    .filter((provider) => provider.state === "cooldown")
    .map((provider) => {
      const retry = provider.retryAt ? ` until ${provider.retryAt}` : "";
      return `${provider.name} (${provider.reason ?? "cooldown"}${retry})`;
    });
  return [
    available.length > 0 ? `available: ${available.join(", ")}` : undefined,
    cooldown.length > 0 ? `cooldown: ${cooldown.join(", ")}` : undefined,
    unavailable.length > 0 ? `unavailable: ${unavailable.join(", ")}` : undefined,
  ].filter(Boolean).join("; ");
}

function packageAvailability(
  provider: LocalAgentProvider,
  packageName: string,
): LocalAgentProviderAvailability {
  try {
    import.meta.resolve(packageName);
    return { name: provider, available: true, state: "available" };
  } catch {
    return {
      name: provider,
      available: false,
      state: "unavailable",
      reason: `${packageName} package not found`,
    };
  }
}

function commandAvailability(
  provider: LocalAgentProvider,
  command: string,
  options: { env?: NodeJS.ProcessEnv } = {},
): LocalAgentProviderAvailability {
  const executable = resolveCommand(command, options.env);
  if (!executable) {
    return {
      name: provider,
      available: false,
      state: "unavailable",
      reason: `${provider} executable not found`,
    };
  }

  return { name: provider, available: true, state: "available" };
}

function resolveCommand(command: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const commandHasPath = command.includes("/") || command.includes("\\");
  if (commandHasPath) return executableExists(command, env) ? command : undefined;

  for (const candidate of candidateCommandPaths(command, env)) {
    if (executableExists(candidate, env)) return candidate;
  }
  return undefined;
}

function candidateCommandPaths(command: string, env: NodeJS.ProcessEnv): string[] {
  const path = env.PATH;
  if (!path) return [];
  const extensions = process.platform === "win32"
    ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .filter(Boolean)
    : [""];
  const candidates: string[] = [];
  for (const directory of path.split(delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      candidates.push(resolve(directory, `${command}${extension}`));
    }
  }
  return candidates;
}

function executableExists(command: string, env: NodeJS.ProcessEnv): boolean {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    env,
    windowsHide: true,
    timeout: 5_000,
  });
  const code = typeof result.error === "object" && result.error && "code" in result.error
    ? result.error.code
    : undefined;
  return code !== "ENOENT";
}

function piAvailabilityEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.PI_COMMAND) return env;
  const path = env.PATH;
  if (!path) return env;
  return {
    ...env,
    PATH: removeDevspaceNodeModulesBinFromPath(path),
  };
}
