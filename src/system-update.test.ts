import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSystemUpdateTools } from "./system-update-mcp.js";
import {
  createWindowsSystemUpdateController,
  type SystemUpdateController,
} from "./system-update.js";

const root = await mkdtemp(join(tmpdir(), "dpkr-helix-system-update-test-"));

try {
  const unavailable = createWindowsSystemUpdateController({
    platform: "linux",
    userHome: root,
  });
  assert.deepEqual(await unavailable.getStatus(), {
    available: false,
    phase: "idle",
    active: false,
    code: "WINDOWS_PORTABLE_SETUP_REQUIRED",
    message: "ChatGPT-initiated updates are available only for the portable Windows installation.",
  });

  const devspaceDir = join(root, ".devspace");
  await mkdir(devspaceDir, { recursive: true });
  await writeFile(join(devspaceDir, "setup-windows.ps1"), "# managed setup\n");
  await writeFile(join(devspaceDir, "windows-bootstrap.json"), JSON.stringify({
    schema: "devspace-windows-bootstrap/v1",
    sourceRoot: join(root, "source"),
    tunnelMode: "QuickTunnel",
  }));
  const quickTunnel = createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
  });
  assert.equal((await quickTunnel.getStatus()).code, "STABLE_ENDPOINT_REQUIRED");
  const unavailableRequest = await quickTunnel.requestUpdate();
  assert.equal(unavailableRequest.accepted, false);
  assert.equal(unavailableRequest.status.code, "STABLE_ENDPOINT_REQUIRED");
  assert.match(unavailableRequest.message, /stable endpoint/i);

  await writeFile(join(devspaceDir, "windows-bootstrap.json"), JSON.stringify({
    schema: "devspace-windows-bootstrap/v1",
    sourceRoot: join(root, "source"),
    tunnelMode: "External",
  }));
  await writeFile(join(devspaceDir, "windows-update.json"), "{broken");
  const recoverableInvalid = await createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
  }).getStatus();
  assert.equal(recoverableInvalid.available, true);
  assert.equal(recoverableInvalid.phase, "failed");
  assert.equal(recoverableInvalid.code, "UPDATE_STATUS_INVALID");
  await writeFile(join(devspaceDir, "windows-update.json"), JSON.stringify({
    schema: "dpkr-helix-windows-update/v1",
    state: "rolled_back",
    requestId: "00000000-0000-4000-8000-000000000001",
    fromCommit: "a".repeat(40),
    targetCommit: "b".repeat(40),
    startedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:01:00.000Z",
    completedAt: "2026-08-01T00:01:00.000Z",
    code: "APPLY_FAILED_ROLLED_BACK",
    message: "C:\\Users\\private\\secret.txt",
  }));
  const sanitized = await createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
  }).getStatus();
  assert.equal(sanitized.phase, "rolled_back");
  assert.equal(sanitized.active, false);
  assert.equal(sanitized.fromCommit, "a".repeat(40));
  assert.equal(sanitized.message.includes("private"), false);
  assert.equal("sourceRoot" in sanitized, false);

  const calls: Array<{ command: string; args: readonly string[]; options: SpawnOptions }> = [];
  const controller = createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
    systemRoot: "C:\\Windows",
    createRequestId: () => "00000000-0000-4000-8000-000000000002",
    isProcessAlive: () => true,
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0, null));
      return child as unknown as ChildProcess;
    },
  });
  const request = await controller.requestUpdate();
  assert.equal(request.accepted, true);
  assert.equal(request.status.phase, "preflight");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.deepEqual(calls[0]?.args.slice(-4), [
    "-Mode",
    "LaunchUpdate",
    "-UpdateRequestId",
    "00000000-0000-4000-8000-000000000002",
  ]);
  assert.equal(calls[0]?.options.detached, undefined);
  assert.equal(calls[0]?.options.windowsHide, true);
  assert.equal(calls[0]?.options.shell, false);
  assert.deepEqual(calls[0]?.options.stdio, ["ignore", "pipe", "pipe"]);
  const immediateDuplicate = await controller.requestUpdate();
  assert.equal(immediateDuplicate.accepted, false);
  assert.equal(immediateDuplicate.requestId, request.requestId);
  assert.equal(calls.length, 1, "an immediate duplicate must not spawn a second updater");
  const launchFailure = createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
    spawn: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("error", new Error(`ENOENT ${root}`)));
      return child as unknown as ChildProcess;
    },
  });
  await assert.rejects(
    () => launchFailure.requestUpdate(),
    (error: Error) => !error.message.includes(root) && error.message.includes("could not be started"),
  );
  const launcherFailure = createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
    spawn: () => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 1, null));
      return child as unknown as ChildProcess;
    },
  });
  await assert.rejects(
    () => launcherFailure.requestUpdate(),
    (error: Error) => error.message.includes("could not be started"),
  );

  await writeFile(join(devspaceDir, "windows-update.json"), JSON.stringify({
    schema: "dpkr-helix-windows-update/v1",
    state: "applying",
    requestId: request.requestId,
    updaterPid: 4242,
  }));
  const duplicate = await controller.requestUpdate();
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.requestId, request.requestId);
  assert.equal(calls.length, 1, "an active update must not spawn a duplicate updater");
  const interrupted = await createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
    isProcessAlive: () => false,
  }).getStatus();
  assert.equal(interrupted.phase, "failed");
  assert.equal(interrupted.active, false);
  assert.equal(interrupted.code, "UPDATE_INTERRUPTED");
  assert.equal("updaterPid" in interrupted, false);

  await writeFile(join(devspaceDir, "windows-update.json"), JSON.stringify({
    schema: "dpkr-helix-windows-update/v1",
    state: "preflight",
    requestId: "00000000-0000-4000-8000-000000000005",
    updaterPid: 4242,
    updatedAt: "2026-07-31T21:00:00.000Z",
  }));
  const stale = await createWindowsSystemUpdateController({
    platform: "win32",
    userHome: root,
    isProcessAlive: () => true,
    now: () => Date.parse("2026-08-01T00:00:01.000Z"),
  }).getStatus();
  assert.equal(stale.phase, "preflight");
  assert.equal(stale.active, true);
  assert.equal(stale.code, "UPDATE_STATUS_STALE");
  assert.match(stale.message, /do not retry/i);

  let mcpUpdateRequests = 0;
  const mcpController: SystemUpdateController = {
    async getStatus() {
      return {
        available: true,
        phase: "rejected",
        active: false,
        message: "The update was rejected without replacing the running installation.",
        code: "DIRTY_WORKTREE",
      };
    },
    async requestUpdate() {
      mcpUpdateRequests += 1;
      if (mcpUpdateRequests > 1) throw new Error(`private path: ${root}`);
      return {
        accepted: true,
        requestId: "00000000-0000-4000-8000-000000000004",
        status: {
          available: true,
          phase: "preflight",
          active: true,
          message: "The candidate is being verified.",
        },
        message: "Update accepted.",
      };
    },
  };
  const mcpServer = new McpServer({ name: "update-test", version: "0.0.0" });
  const toolLogs: Array<{ tool: string; success: boolean }> = [];
  registerSystemUpdateTools(mcpServer, mcpController, (fields) => {
    toolLogs.push(fields);
  });
  const client = new Client({ name: "update-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([mcpServer.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    const statusTool = tools.tools.find((tool) => tool.name === "get_dpkr_helix_update_status");
    const updateTool = tools.tools.find((tool) => tool.name === "update_dpkr_helix");
    assert.deepEqual(statusTool?.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    assert.deepEqual(updateTool?.annotations, {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
    assert.match(statusTool?.description ?? "", /historical attempt/i);
    const statusResult = await client.callTool({
      name: "get_dpkr_helix_update_status",
      arguments: {},
    }) as { content?: Array<{ text?: string }>; structuredContent?: Record<string, unknown> };
    assert.equal(statusResult.structuredContent?.phase, "rejected");
    assert.equal(statusResult.structuredContent?.statusScope, "last_attempt");
    assert.equal(statusResult.structuredContent?.canRequestUpdate, true);
    assert.match(statusResult.content?.[0]?.text ?? "", /historical result/i);
    assert.equal("sourceRoot" in (statusResult.structuredContent ?? {}), false);
    const updateResult = await client.callTool({
      name: "update_dpkr_helix",
      arguments: {},
    }) as { structuredContent?: Record<string, unknown> };
    assert.equal(updateResult.structuredContent?.accepted, true);
    assert.equal((updateResult.structuredContent?.status as Record<string, unknown>)?.statusScope, "current_attempt");
    assert.equal(mcpUpdateRequests, 1);
    const failedUpdate = await client.callTool({
      name: "update_dpkr_helix",
      arguments: {},
    }) as { content?: Array<{ text?: string }> };
    assert.equal(failedUpdate.content?.[0]?.text?.includes(root), false);
    assert.equal(mcpUpdateRequests, 2);
    assert.deepEqual(toolLogs.map(({ tool, success }) => ({ tool, success })), [
      { tool: "get_dpkr_helix_update_status", success: true },
      { tool: "update_dpkr_helix", success: true },
      { tool: "update_dpkr_helix", success: false },
    ]);
  } finally {
    await client.close();
    await mcpServer.close();
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("system update tests: pass");
