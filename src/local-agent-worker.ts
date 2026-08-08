#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createCliLocalAgentService } from "./local-agent-cli-service.js";

export async function runLocalAgentWorker(args: string[]): Promise<void> {
  const [id, promptFileFlag, promptFile] = args;
  if (!id || promptFileFlag !== "--prompt-file" || !promptFile) {
    throw new Error("Usage: local-agent-worker <id> --prompt-file <path>");
  }

  const config = loadConfig();
  const service = createCliLocalAgentService(config, {
    reconcileStaleActive: false,
  });
  try {
    process.send?.({ type: "devspace-agent-worker-ready", id });
    if (process.connected) process.disconnect?.();
    await service.runWorker(id, promptFile);
  } finally {
    service.close();
  }
}

if (process.argv[1]) {
  const entry = pathToFileURL(resolve(process.argv[1])).href;
  if (entry === import.meta.url) {
    void runLocalAgentWorker(process.argv.slice(2)).catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
}
