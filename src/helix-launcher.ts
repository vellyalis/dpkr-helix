import { loadConfig } from "./config.js";
import {
  buildCodexLaunchPlan,
  findCodexInvocation,
  parseHelixArgs,
  type ParsedHelixCommand,
} from "./helix-command.js";
import {
  printProjects,
  readHandoff,
  resolveLauncherTarget,
} from "./helix-projects.js";
import {
  ensureHelixRunning,
  openDashboard,
  printStatus,
  readPackageVersion,
  runDoctor,
  runInherited,
  runManagedRecovery,
  runManagedSetup,
  runUpdateAndWait,
} from "./helix-runtime.js";

export {
  buildCodexLaunchPlan,
  buildHandoffPrompt,
  findCodexInvocation,
  parseHelixArgs,
} from "./helix-command.js";
export { selectDiscoveryMatches } from "./helix-projects.js";

export async function runHelixCli(argv: readonly string[]): Promise<number> {
  const parsed = parseHelixArgs(argv);

  switch (parsed.command) {
    case "help":
      printHelixHelp();
      return 0;
    case "version":
      console.log(readPackageVersion());
      return 0;
    case "projects":
      await printProjects(loadConfig());
      return 0;
    case "status":
      await printStatus();
      return 0;
    case "up":
      return runManagedSetup("Start", [
        "-SkipVerification",
        "-SkipBrowserLaunch",
      ]);
    case "down":
      return runManagedSetup("Stop");
    case "restart": {
      const stopCode = await runManagedSetup("Stop");
      if (stopCode !== 0) return stopCode;
      return runManagedSetup("Start", [
        "-SkipVerification",
        "-SkipBrowserLaunch",
      ]);
    }
    case "recover":
      return runManagedRecovery();
    case "doctor":
      return runDoctor();
    case "dashboard":
      openDashboard();
      return 0;
    case "update":
      return runUpdateAndWait();
    case "codex":
    case "continue":
    case "resume":
      return runCodexCommand(parsed);
  }
}

async function runCodexCommand(parsed: ParsedHelixCommand): Promise<number> {
  const config = loadConfig();
  const target = await resolveLauncherTarget(
    config,
    parsed.selector,
    process.cwd(),
  );
  await ensureHelixRunning(config);
  const handoff = parsed.command === "continue"
    ? readHandoff(config.stateDir, target)
    : undefined;
  const invocation = findCodexInvocation();
  const plan = buildCodexLaunchPlan(invocation, parsed, target, handoff);

  console.log(`Opening ${plan.label} with official Codex...`);
  return runInherited(plan.command, plan.args, {
    cwd: plan.cwd,
    env: {
      ...process.env,
      DEVSPACE_WORKSPACE_ROOT: plan.cwd,
      ...(target.project ? { DEVSPACE_PROJECT_ID: target.project.id } : {}),
    },
  });
}

function printHelixHelp(): void {
  console.log([
    "dpkr helix — official Codex launcher and local lifecycle control",
    "",
    "Usage:",
    "  helix [project] [-- <codex args>]       Open official Codex in a registered project or current directory",
    "  helix codex [project] [-- <codex args>] Same as above",
    "  helix continue [project]                Start Codex with the latest dpkr helix handoff",
    "  helix resume [project] [-- <args>]      Resume the last Codex session for the project",
    "  helix resume [project] --picker         Show the Codex session picker",
    "  helix projects                          List registered and discoverable projects",
    "  helix up | down | restart               Use the existing managed Windows lifecycle owner",
    "  helix recover                           Run one managed integrity/health recovery check",
    "  helix status                            Show Helix, recovery, update, and Codex status",
    "  helix doctor                            Run Helix status/doctor and official Codex doctor",
    "  helix dashboard                         Open the local operations dashboard",
    "  helix update                            Run the verified managed self-update and wait for its result",
    "  helix -v | --version                    Print the installed dpkr helix version",
    "",
    "Examples:",
    "  helix studyforge",
    "  helix continue studyforge",
    "  helix resume studyforge",
    "  helix studyforge -- -m gpt-5.6-sol --search",
    "",
    "The launcher uses the official Codex CLI, its ChatGPT sign-in, and its normal usage limits.",
    "It does not create a second ChatGPT client or use OpenAI API billing.",
  ].join("\n"));
}
