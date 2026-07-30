import { assertNoForbiddenSensitiveContent } from "./sensitive-content.js";

export interface LocalAgentTaskEnvelope {
  goal: string;
  context?: string;
  relevantFiles?: string[];
  acceptanceCriteria: string[];
  rules?: string[];
  verification?: string[];
  sourceDocuments?: string[];
}

export interface DelegateLocalAgentTaskInput extends LocalAgentTaskEnvelope {
  workspaceId: string;
  target?: string;
  model?: string;
  thinking?: string;
}

const DEFAULT_CONTEXT = "Use repository context and referenced documents.";
const DEFAULT_RULES = [
  "Keep changes focused.",
  "Do not perform unrelated refactors.",
  "Report blockers clearly.",
] as const;

export function renderLocalAgentTaskEnvelope(envelope: LocalAgentTaskEnvelope): string {
  assertSafeLocalAgentTaskEnvelope(envelope);
  return [
    renderTextSection("Goal", envelope.goal),
    renderTextSection("Context", envelope.context ?? DEFAULT_CONTEXT),
    renderListSection("Relevant files", envelope.relevantFiles),
    renderListSection("Source documents", envelope.sourceDocuments),
    renderListSection("Acceptance criteria", envelope.acceptanceCriteria),
    renderListSection("Verification", envelope.verification),
    renderListSection("Rules", [...(envelope.rules ?? []), ...DEFAULT_RULES]),
  ].join("\n\n");
}

function assertSafeLocalAgentTaskEnvelope(envelope: LocalAgentTaskEnvelope): void {
  assertNoForbiddenSensitiveContent("Local-agent task envelope", [
    ["goal", envelope.goal],
    ["context", envelope.context ?? ""],
    ...toNamedValues("relevantFiles", envelope.relevantFiles),
    ...toNamedValues("sourceDocuments", envelope.sourceDocuments),
    ...toNamedValues("acceptanceCriteria", envelope.acceptanceCriteria),
    ...toNamedValues("verification", envelope.verification),
    ...toNamedValues("rules", envelope.rules),
  ]);
}

function toNamedValues(
  name: string,
  values: readonly string[] | undefined,
): Array<[string, string]> {
  return (values ?? []).map((value, index) => [`${name}[${index}]`, value]);
}

function renderTextSection(title: string, value: string): string {
  return `${title}:\n${normalizeText(value)}`;
}

function renderListSection(title: string, values: readonly string[] | undefined): string {
  const items = values?.map(normalizeText).filter(Boolean) ?? [];
  return `${title}:\n${items.length > 0 ? items.map(renderBullet).join("\n") : "- None specified."}`;
}

function renderBullet(value: string): string {
  return `- ${value.replaceAll("\n", "\n  ")}`;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\r\n?/g, "\n");
}
