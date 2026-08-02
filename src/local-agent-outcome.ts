export type LocalAgentDisposition = "completed" | "needs_input";

export interface LocalAgentOutcome {
  disposition: LocalAgentDisposition;
  report: string;
  question?: string;
}

export const MAX_LOCAL_AGENT_REPORT_CHARACTERS = 32_000;
export const MAX_LOCAL_AGENT_QUESTION_CHARACTERS = 2_000;

export const LOCAL_AGENT_OUTCOME_JSON_SCHEMA = {
  type: "object",
  properties: {
    disposition: {
      type: "string",
      enum: ["completed", "needs_input"],
    },
    report: {
      type: "string",
      maxLength: MAX_LOCAL_AGENT_REPORT_CHARACTERS,
    },
    question: {
      type: ["string", "null"],
      maxLength: MAX_LOCAL_AGENT_QUESTION_CHARACTERS,
      description: "One actionable question for needs_input; null for completed.",
    },
  },
  required: ["disposition", "report", "question"],
  additionalProperties: false,
} as const;

export function parseLocalAgentOutcome(value: string): LocalAgentOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidOutcome();
  }
  return validateLocalAgentOutcome(parsed);
}

export function validateLocalAgentOutcome(value: unknown): LocalAgentOutcome {
  if (!isRecord(value)) throw invalidOutcome();
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "disposition" && key !== "report" && key !== "question")) {
    throw invalidOutcome();
  }

  const disposition = value.disposition;
  const report = boundedString(value.report, MAX_LOCAL_AGENT_REPORT_CHARACTERS, false);
  if (disposition === "completed") {
    if (!report || (value.question !== null && value.question !== undefined)) throw invalidOutcome();
    return { disposition, report };
  }
  if (disposition === "needs_input") {
    const question = boundedString(value.question, MAX_LOCAL_AGENT_QUESTION_CHARACTERS, true);
    if (!question) throw invalidOutcome();
    return { disposition, report, question };
  }
  throw invalidOutcome();
}

function boundedString(value: unknown, maximum: number, required: boolean): string {
  if (typeof value !== "string" || Array.from(value).length > maximum) throw invalidOutcome();
  const normalized = value.trim();
  if (required && !normalized) throw invalidOutcome();
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidOutcome(): Error {
  return new Error("Codex returned an invalid structured local-agent outcome.");
}
