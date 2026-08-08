import { fileURLToPath } from "node:url";

export function localAgentWorkerFilePath(): string {
  const modulePath = fileURLToPath(import.meta.url);
  const extension = modulePath.endsWith(".ts") ? ".ts" : ".js";
  return fileURLToPath(new URL(`./local-agent-worker${extension}`, import.meta.url));
}
