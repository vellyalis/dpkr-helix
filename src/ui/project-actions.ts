import type { ProjectCardView, ProjectOpenMode } from "./card-types.js";

interface SupportedContentModalities {
  text?: object;
  structuredContent?: object;
  [key: string]: object | undefined;
}

interface HostCapabilities {
  serverTools?: object;
  message?: SupportedContentModalities;
  updateModelContext?: SupportedContentModalities;
}

interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export interface ProjectContextUpdate {
  content?: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}

export interface ProjectOpenAction {
  name: "open_project";
  arguments: {
    project: string;
    mode: ProjectOpenMode;
  };
}

export function canCallServerTools(
  capabilities: HostCapabilities | undefined,
): boolean {
  return Boolean(capabilities?.serverTools);
}

export function canSendMessages(
  capabilities: HostCapabilities | undefined,
): boolean {
  return Boolean(capabilities?.message?.text);
}

export function projectOpenAction(
  project: Pick<ProjectCardView, "id">,
  mode: ProjectOpenMode,
): ProjectOpenAction {
  return {
    name: "open_project",
    arguments: {
      project: project.id,
      mode,
    },
  };
}

export function projectOpenFallbackMessage(
  project: Pick<ProjectCardView, "id" | "slug" | "name">,
  mode: ProjectOpenMode,
): string {
  return `Open dpkr helix project "${project.name}" by calling open_project with project="${project.id}" (slug "${project.slug}") and mode="${mode}".`;
}

export function projectOpenCopyCommand(
  project: Pick<ProjectCardView, "id">,
  mode: ProjectOpenMode,
): string {
  return JSON.stringify(projectOpenAction(project, mode), null, 2);
}

export function projectContextUpdate(
  capabilities: HostCapabilities["updateModelContext"] | undefined,
  project: Pick<ProjectCardView, "name">,
  mode: ProjectOpenMode,
  structuredContent: Record<string, unknown> | undefined,
): ProjectContextUpdate | undefined {
  const update: ProjectContextUpdate = {};
  if (capabilities?.text) {
    update.content = [{
      type: "text",
      text: `dpkr helix opened project ${project.name} in ${mode} mode.`,
    }];
  }
  if (capabilities?.structuredContent && structuredContent) {
    update.structuredContent = structuredContent;
  }
  return update.content || update.structuredContent ? update : undefined;
}

export async function tryCopyProjectOpenCommand(
  clipboard: ClipboardWriter | undefined,
  command: string,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(command);
    return true;
  } catch {
    return false;
  }
}
