import type { ServerConfig } from "./config.js";
import {
  createDetachedLocalAgentWorkerSpawner,
  LocalAgentService,
} from "./local-agent-service.js";
import type { LocalAgentWriteMode } from "./local-agent-runtime.js";
import { LocalAgentOperationProjector } from "./operations/local-agent-operation-projector.js";
import { OperationRunService } from "./operations/operation-run-service.js";
import { OperationStore } from "./operations/operation-store.js";
import { localAgentWorkerFilePath } from "./local-agent-worker-path.js";

const CLI_LOCAL_AGENT_WRITE_MODE: LocalAgentWriteMode = "allowed";

export interface CliLocalAgentServiceOptions {
  reconcileStaleActive?: boolean;
  workerFilePath?: string;
}

export function createCliLocalAgentService(
  config: ServerConfig,
  options: CliLocalAgentServiceOptions = {},
): LocalAgentService {
  const operationStore = new OperationStore(config.stateDir);
  return new LocalAgentService({
    config,
    writeMode: CLI_LOCAL_AGENT_WRITE_MODE,
    observation: new LocalAgentOperationProjector(
      new OperationRunService(operationStore),
      operationStore,
    ),
    staleActiveAfterMs: options.reconcileStaleActive === false ? false : undefined,
    workerSpawner: createDetachedLocalAgentWorkerSpawner(
      options.workerFilePath ?? localAgentWorkerFilePath(),
    ),
  });
}
