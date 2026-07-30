import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  isAgentTool,
  isEditTool,
  isExpandableCard,
  isPatchTool,
  isReadTool,
  isReviewTool,
  isToolName,
  isToolResultCard,
  isWriteTool,
  payloadText,
  type HostContext,
  type ProjectCardView,
  type ProjectOpenMode,
  type ToolName,
  type ToolResultCard,
} from "./card-types.js";
import { renderIcon, toolIcons } from "./icons.js";
import {
  canCallServerTools,
  canSendMessages,
  projectContextUpdate,
  projectOpenAction,
  projectOpenCopyCommand,
  projectOpenFallbackMessage,
  tryCopyProjectOpenCommand,
} from "./project-actions.js";
import {
  getToolDisplay,
  getToolHeaderSummary,
  type ToolDisplay,
} from "./tool-display.js";
import "./workspace-app.css";

interface MountedPayload {
  update(options: {
    card: ToolResultCard;
    hostContext?: HostContext;
    errorMessage?: string | null;
    visibleFileCount?: number;
  }): void;
  unmount(): void;
}

let app: App | null = null;
let connected = false;
let connectionError: string | null = null;
let hostContext: HostContext | undefined;
let hostCapabilities: ReturnType<App["getHostCapabilities"]> | undefined;
let card: ToolResultCard | null = null;
let expanded = false;
let reviewFilesExpanded = false;
let errorMessage: string | null = null;
let currentPayload: MountedPayload | null = null;
let currentPayloadContainer: HTMLElement | null = null;

const maybeAppRoot = document.querySelector<HTMLElement>("#app");

if (!maybeAppRoot) {
  throw new Error("Missing #app root element.");
}

const appRoot = maybeAppRoot;

void boot();

async function boot(): Promise<void> {
  render();

  app = new App(
    { name: "devspace-tool-cards", version: "0.4.0" },
    {},
  );

  app.ontoolresult = handleToolResult;

  app.onhostcontextchanged = (ctx) => {
    hostContext = {
      ...hostContext,
      ...ctx,
    };
    applyHostContext();
    renderPayloadIfNeeded();
  };

  app.onteardown = async () => {
    unmountPayload();
    return {};
  };

  try {
    await app.connect();
    const initialContext = app.getHostContext();
    if (initialContext) hostContext = initialContext;
    hostCapabilities = app.getHostCapabilities();
    applyHostContext();
    connected = true;
  } catch (connectError) {
    connectionError = connectError instanceof Error
      ? connectError.message
      : String(connectError);
  }

  render();
}

function applyHostContext(): void {
  if (hostContext?.theme) applyDocumentTheme(hostContext.theme);
  if (hostContext?.styles?.variables) {
    applyHostStyleVariables(hostContext.styles.variables);
  }
  if (hostContext?.styles?.css?.fonts) {
    applyHostFonts(hostContext.styles.css.fonts);
  }

  const insets = hostContext?.safeAreaInsets;
  if (!insets) return;

  document.body.style.padding = `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`;
}

function handleToolResult(result: CallToolResult): void {
  const structuredContent = getStructuredContent<Partial<ToolResultCard>>(result);
  const metaCard = cardFromMeta(result);
  const structured = metaCard
    ? { ...structuredContent, ...metaCard }
    : structuredContent;
  const tool = toolNameFromMeta(result);

  if (!tool || !isToolResultCard(structured)) {
    card = null;
    expanded = false;
    reviewFilesExpanded = false;
    errorMessage = "No result card is available for this tool result.";
    render();
    return;
  }

  const nextCard = { ...structured, tool };
  card = nextCard;
  expanded = (
    isReviewTool(tool) ||
    isAgentTool(tool) ||
    tool === "list_projects" ||
    tool === "open_project"
  ) && isExpandableCard(nextCard);
  reviewFilesExpanded = false;
  errorMessage = result.isError ? payloadText(nextCard.payload) || "The tool returned an error." : null;
  render();
}

function render(): void {
  unmountPayload();

  if (connectionError) {
    renderEmpty(connectionError, "error");
    return;
  }

  if (!connected) {
    renderEmpty("Connecting to host...");
    return;
  }

  if (!card) {
    renderEmpty(errorMessage ?? "Waiting for a tool result.", errorMessage ? "error" : "muted");
    return;
  }

  const display = getToolDisplay(card);
  if (card.tool === "list_projects") {
    renderProjectListCard(card, display);
    return;
  }

  if (card.tool === "open_project") {
    renderProjectOpenCard(card, display);
    return;
  }

  if (isAgentTool(card.tool)) {
    renderAgentCard(card, display);
    return;
  }

  if (isReviewTool(card.tool)) {
    renderReviewCard(card, display);
    return;
  }

  const expandable = isExpandableCard(card);
  const main = element("main", { className: "shell" });
  const section = element("section", { className: `tool-card ${display.tone}` });
  const button = element("button", {
    className: "tool-header",
    type: "button",
    ariaExpanded: String(expanded),
    disabled: !expandable,
  });

  if (expandable) {
    button.addEventListener("click", () => {
      expanded = !expanded;
      render();
    });
  }

  const icon = element("span", { className: "tool-icon", ariaHidden: "true" });
  icon.append(renderIcon(display.icon));

  const toolMain = element("span", { className: "tool-main" });
  const title = element("span", { className: "tool-title", text: display.title });
  toolMain.append(title);
  if (display.label) {
    toolMain.append(element("span", {
      className: "tool-label",
      text: display.label,
      title: display.label,
    }));
  }

  button.append(
    icon,
    toolMain,
    renderHeaderSummary(card),
    renderChevron(expanded, expandable),
  );
  section.append(button);

  if (expanded) {
    const body = element("div", { className: "tool-body" });
    currentPayloadContainer = body;
    section.append(body);
  }

  main.append(section);
  appRoot.replaceChildren(main);
  renderPayloadIfNeeded();
}

function renderEmpty(message: string, tone: "muted" | "error" = "muted"): void {
  const main = element("main", { className: "shell" });
  main.append(element("section", { className: `empty ${tone}`, text: message }));
  appRoot.replaceChildren(main);
}

async function renderPayloadIfNeeded(): Promise<void> {
  if (!card || !currentPayloadContainer || !expanded) return;

  const target = currentPayloadContainer;

  if (errorMessage) {
    renderStatus(target, errorMessage, "error");
    return;
  }

  if (card.tool === "open_workspace") {
    renderPrePayload(target, workspacePayloadText(card), "open_workspace");
    return;
  }

  if (shouldUseHeavyPayload(card)) {
    if (currentPayload) {
      currentPayload.update({ card, hostContext, errorMessage });
      return;
    }

    setPayloadLoading(target, true);

    try {
      const { mountHeavyPayload } = await import("./heavy-payload.js");
      if (target !== currentPayloadContainer || !expanded || !card) return;

      setPayloadLoading(target, false);
      currentPayload = mountHeavyPayload(target, {
        card,
        hostContext,
        errorMessage,
      });
    } catch (loadError) {
      if (target !== currentPayloadContainer || !expanded) return;

      setPayloadLoading(target, false);
      renderStatus(
        target,
        loadError instanceof Error ? loadError.message : "Unable to load details.",
        "error",
      );
    }
    return;
  }

  if (isReviewTool(card.tool) || isPatchTool(card.tool)) {
    const visibleFileCount = isReviewTool(card.tool) && !reviewFilesExpanded
      ? Math.max(3, (card.files ?? []).slice(0, 3).length)
      : undefined;

    if (currentPayload) {
      currentPayload.update({ card, hostContext, errorMessage, visibleFileCount });
      return;
    }

    renderStatus(target, isReviewTool(card.tool) ? "Loading review..." : "Loading diff...");

    const { mountReviewPayload } = await import("./review-payload.js");
    if (target !== currentPayloadContainer || !card) return;

    currentPayload = mountReviewPayload(target, {
      card,
      hostContext,
      errorMessage,
      visibleFileCount,
    });
    return;
  }

  const text = payloadText(card.payload);
  if (!text) {
    renderStatus(target, "No details available.");
    return;
  }

  renderPrePayload(target, text, card.tool);
}

function shouldUseHeavyPayload(card: ToolResultCard): boolean {
  return isReadTool(card.tool) || isEditTool(card.tool) || isWriteTool(card.tool);
}

function unmountPayload(): void {
  unmountCurrentPayload();
  currentPayload = null;
  currentPayloadContainer = null;
}

function unmountCurrentPayload(): void {
  currentPayload?.unmount();
  currentPayload = null;
}

function renderStatus(
  container: HTMLElement,
  message: string,
  tone: "muted" | "error" = "muted",
): void {
  unmountCurrentPayload();
  container.replaceChildren(element("div", { className: `status ${tone}`, text: message }));
}

function renderPrePayload(
  container: HTMLElement,
  text: string,
  tool: string,
): void {
  unmountCurrentPayload();
  container.replaceChildren(element("pre", { className: `text-payload ${tool}`, text }));
}

function renderHeaderSummary(card: ToolResultCard): HTMLElement {
  const summary = getToolHeaderSummary(card);

  if (summary.kind === "diff") {
    const stats = element("span", { className: "stats" });
    stats.setAttribute("aria-label", "Diff statistics");
    stats.append(
      element("span", { className: "add", text: `+${String(summary.additions)}` }),
      element("span", { className: "remove", text: `-${String(summary.removals)}` }),
    );
    return stats;
  }

  const meta = element("span", {
    className: `header-meta ${summary.kind === "empty" ? "empty" : ""}`,
    text: summary.kind === "text" ? summary.text : "",
  });
  if (summary.kind === "empty") meta.setAttribute("aria-hidden", "true");
  return meta;
}

function renderProjectListCard(card: ToolResultCard, display: ToolDisplay): void {
  unmountPayload();

  const main = element("main", { className: "shell" });
  const section = element("section", { className: `tool-card ${display.tone}` });
  section.append(renderStaticHeader(card, display));

  const body = element("div", { className: "project-list" });
  const projects = card.projects ?? [];
  if (projects.length === 0) {
    body.append(element("div", { className: "status muted", text: "No registered projects are available." }));
  } else {
    for (const project of projects) {
      body.append(renderProjectRow(project));
    }
  }
  section.append(body);
  main.append(section);
  appRoot.replaceChildren(main);
}

function renderProjectOpenCard(card: ToolResultCard, display: ToolDisplay): void {
  unmountPayload();

  const main = element("main", { className: "shell" });
  const section = element("section", { className: `tool-card ${display.tone}` });
  section.append(renderStaticHeader(card, display));

  const body = element("div", { className: "project-open" });
  if (card.project) {
    const project = card.project;
    body.append(renderKeyValue("Project", project.name && project.slug ? `${project.name} (${project.slug})` : project.name ?? project.slug ?? "unknown"));
    if (project.permissionPreset) body.append(renderKeyValue("Preset", project.permissionPreset));
    if (project.defaultMode) body.append(renderKeyValue("Default mode", project.defaultMode));
  }
  if (card.workspaceId) body.append(renderKeyValue("Workspace", card.workspaceId));
  if (card.root) body.append(renderKeyValue("Root", card.root));
  const text = payloadText(card.payload);
  if (text) body.append(element("pre", { className: "text-payload open_project", text }));
  section.append(body);
  main.append(section);
  appRoot.replaceChildren(main);
}

function renderAgentCard(card: ToolResultCard, display: ToolDisplay): void {
  unmountPayload();

  const main = element("main", { className: "shell" });
  const section = element("section", { className: `tool-card ${display.tone}` });
  section.append(renderStaticHeader(card, display));

  const body = element("div", { className: "agent-list" });
  const agents = card.agent ? [card.agent] : (card.agents ?? []);
  if (agents.length === 0) {
    body.append(element("div", { className: "status muted", text: "No local-agent sessions found." }));
  }

  for (const agent of agents) {
    const record = element("article", { className: "agent-record" });
    record.append(
      renderKeyValue("Agent", agent.id),
      renderKeyValue("Status", agent.status),
      renderKeyValue("Profile", agent.profileName),
      renderKeyValue("Provider", agent.provider),
    );
    if (agent.model) record.append(renderKeyValue("Model", agent.model));
    if (agent.thinking) record.append(renderKeyValue("Thinking", agent.thinking));
    if (agent.resultAvailable) {
      record.append(renderKeyValue("Assurance", "Result available — verification pending"));
    }
    if (agent.latestResponse) {
      record.append(element("pre", {
        className: "text-payload agent-response",
        text: agent.latestResponse,
      }));
    }
    if (agent.error) {
      record.append(element("div", { className: "status error", text: agent.error }));
    }
    body.append(record);
  }

  section.append(body);
  main.append(section);
  appRoot.replaceChildren(main);
}

function renderStaticHeader(card: ToolResultCard, display: ToolDisplay): HTMLElement {
  const header = element("div", { className: "tool-header static" });
  const icon = element("span", { className: "tool-icon", ariaHidden: "true" });
  icon.append(renderIcon(display.icon));
  const toolMain = element("span", { className: "tool-main" });
  toolMain.append(element("span", { className: "tool-title", text: display.title }));
  if (display.label) {
    toolMain.append(element("span", {
      className: "tool-label",
      text: display.label,
      title: display.label,
    }));
  }
  header.append(icon, toolMain, renderHeaderSummary(card), element("span"));
  return header;
}

function renderProjectRow(project: ProjectCardView): HTMLElement {
  const row = element("article", { className: `project-row ${project.availability}` });
  const main = element("div", { className: "project-row-main" });
  main.append(
    element("div", { className: "project-name", text: project.name }),
    element("div", { className: "project-slug", text: project.slug, title: project.id }),
    renderProjectMeta(project),
  );

  const actions = element("div", { className: "project-actions" });
  const feedback = element("div", { className: "project-action-feedback" });
  actions.append(
    renderOpenButton(project, "checkout", feedback),
    renderOpenButton(project, "worktree", feedback),
  );
  row.append(main, actions, feedback);
  return row;
}

function renderProjectMeta(project: ProjectCardView): HTMLElement {
  const meta = element("div", { className: "project-meta" });
  meta.append(
    renderPill(project.availability, project.availability === "available" ? "ok" : "warn"),
    renderPill(project.permissionPreset),
    renderPill(project.defaultMode),
  );
  if (project.unavailableReason) {
    meta.append(element("span", {
      className: "project-reason",
      text: project.unavailableReason,
      title: project.unavailableReason,
    }));
  }
  return meta;
}

function renderPill(text: string, tone = "neutral"): HTMLElement {
  return element("span", { className: `project-pill ${tone}`, text });
}

function renderOpenButton(
  project: ProjectCardView,
  mode: ProjectOpenMode,
  feedback: HTMLElement,
): HTMLElement {
  const button = element("button", {
    className: "project-action",
    type: "button",
    text: mode === "checkout" ? "Open Checkout" : "Open Worktree",
    disabled: project.availability !== "available",
  });
  button.addEventListener("click", () => {
    void openProjectFromCard(project, mode, button, feedback);
  });
  return button;
}

async function openProjectFromCard(
  project: ProjectCardView,
  mode: ProjectOpenMode,
  button: HTMLElement,
  feedback: HTMLElement,
): Promise<void> {
  if (!app) return;

  const originalText = button.textContent ?? "";
  feedback.replaceChildren();
  button.textContent = "Opening...";
  button.setAttribute("aria-busy", "true");

  try {
    if (canCallServerTools(hostCapabilities)) {
      const result = await app.callServerTool(projectOpenAction(project, mode));
      if (!result.isError) {
        const update = projectContextUpdate(
          hostCapabilities?.updateModelContext,
          project,
          mode,
          result.structuredContent as Record<string, unknown> | undefined,
        );
        if (update) await app.updateModelContext(update);
      }
      handleToolResult(result);
      return;
    }

    const fallback = projectOpenFallbackMessage(project, mode);
    if (canSendMessages(hostCapabilities)) {
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: fallback }],
      });
      button.textContent = "Sent";
      return;
    }

    const command = projectOpenCopyCommand(project, mode);
    feedback.replaceChildren(element("pre", {
      className: "project-copy-command",
      text: command,
    }));
    const copied = await tryCopyProjectOpenCommand(navigator.clipboard, command);
    button.textContent = copied ? "Copied" : "Copy manually";
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Project open action failed.";
    render();
  } finally {
    window.setTimeout(() => {
      button.textContent = originalText;
      button.removeAttribute("aria-busy");
    }, 900);
  }
}

function renderKeyValue(key: string, value: string): HTMLElement {
  const row = element("div", { className: "project-kv" });
  row.append(
    element("span", { className: "project-k", text: key }),
    element("span", { className: "project-v", text: value, title: value }),
  );
  return row;
}

function renderReviewCard(card: ToolResultCard, display: ToolDisplay): void {
  unmountPayload();

  const files = card.files ?? [];
  const visibleFiles = reviewFilesExpanded ? files : files.slice(0, 3);
  const hiddenCount = Math.max(0, files.length - visibleFiles.length);
  const expandable = isExpandableCard(card);
  const main = element("main", { className: "shell" });
  const section = element("section", { className: "tool-card review" });
  const header = element("button", {
    className: "tool-header review-header",
    type: "button",
    ariaExpanded: String(expanded),
    disabled: !expandable,
  });

  if (expandable) {
    header.addEventListener("click", () => {
      expanded = !expanded;
      render();
    });
  }

  const icon = element("span", { className: "tool-icon", ariaHidden: "true" });
  icon.append(renderIcon(display.icon));
  const titleGroup = element("span", { className: "tool-main review-title-group" });

  titleGroup.append(element("span", { className: "tool-title", text: display.title }));
  if (display.label) {
    titleGroup.append(element("span", {
      className: "tool-label",
      text: display.label,
      title: display.label,
    }));
  }
  header.append(
    icon,
    titleGroup,
    renderHeaderSummary(card),
    renderChevron(expanded, expandable),
  );

  section.append(header);
  if (expanded) {
    const body = element("div", { className: "review-summary" });
    const payload = element("div", { className: "review-payload" });
    currentPayloadContainer = payload;
    body.append(payload);

    if (hiddenCount > 0) {
      const showMore = element("button", {
        className: "review-more",
        type: "button",
        text: `Show ${hiddenCount} more ${hiddenCount === 1 ? "file" : "files"}`,
      });
      showMore.addEventListener("click", () => {
        reviewFilesExpanded = true;
        render();
      });
      body.append(showMore);
    }

    section.append(body);
  }

  main.append(section);
  appRoot.replaceChildren(main);
  renderPayloadIfNeeded();
}

function renderChevron(isExpanded: boolean, visible: boolean): HTMLElement {
  const chevron = element("span", {
    className: visible ? `chevron ${isExpanded ? "expanded" : ""}` : "chevron",
    ariaHidden: "true",
  });

  if (visible) {
    chevron.append(renderIcon(toolIcons.chevronDown));
  }

  return chevron;
}

function setPayloadLoading(container: HTMLElement, loading: boolean): void {
  const header = container.previousElementSibling;
  const chevron = header?.querySelector<HTMLElement>(".chevron");
  if (!chevron) return;

  chevron.classList.toggle("loading", loading);
  chevron.replaceChildren(
    renderIcon(loading ? toolIcons.loading : toolIcons.chevronDown),
  );

  const button = header instanceof HTMLButtonElement ? header : null;
  if (button) button.setAttribute("aria-busy", String(loading));
}

function workspacePayloadText(card: ToolResultCard): string {
  const agentsFiles = card.agentsFiles ?? [];
  const availableAgentsFiles = card.availableAgentsFiles ?? [];
  const skills = card.skills ?? [];
  const lines = [
    card.workspaceId ? `Workspace: ${card.workspaceId}` : undefined,
    card.root ? `Root: ${card.root}` : undefined,
    skills.length > 0
      ? `Skills: ${skills.map((skill) => skill.name ?? skill.path ?? "unnamed").join(", ")}`
      : "Skills: none",
    availableAgentsFiles.length > 0
      ? `Nested instructions: ${availableAgentsFiles.map((file) => file.path ?? "unknown").join(", ")}`
      : undefined,
    agentsFiles.length > 0
      ? `\n${formatAgentsFilesForPayload(agentsFiles)}`
      : "\nAGENTS.md: none loaded",
  ].filter((line): line is string => typeof line === "string");

  return lines.join("\n");
}

function formatAgentsFilesForPayload(
  agentsFiles: NonNullable<ToolResultCard["agentsFiles"]>,
): string {
  return agentsFiles
    .map((file) => {
      const path = file.path ?? "AGENTS.md";
      const content = file.content?.trim();
      return content ? `${path}\n\n${content}` : `${path}\n\nNo content loaded.`;
    })
    .join("\n\n");
}

function toolNameFromMeta(result: CallToolResult): ToolName | undefined {
  const meta = result._meta as Record<string, unknown> | undefined;
  const tool = meta?.tool;
  return isToolName(tool) ? tool : undefined;
}

function cardFromMeta(result: CallToolResult): Partial<ToolResultCard> | undefined {
  const meta = result._meta as Record<string, unknown> | undefined;
  const metaCard = meta?.card;
  return metaCard && typeof metaCard === "object" ? metaCard : undefined;
}

function getStructuredContent<T>(result: CallToolResult): T | undefined {
  return result.structuredContent as T | undefined;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    text?: string;
    type?: string;
    title?: string;
    ariaHidden?: string;
    ariaExpanded?: string;
    disabled?: boolean;
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.type !== undefined && "type" in node) node.setAttribute("type", options.type);
  if (options.title !== undefined) node.title = options.title;
  if (options.ariaHidden !== undefined) node.setAttribute("aria-hidden", options.ariaHidden);
  if (options.ariaExpanded !== undefined) node.setAttribute("aria-expanded", options.ariaExpanded);
  if (options.disabled !== undefined && "disabled" in node) {
    (node as HTMLButtonElement).disabled = options.disabled;
  }
  return node;
}

