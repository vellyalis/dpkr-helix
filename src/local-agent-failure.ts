import type { LocalAgentProvider } from "./local-agent-profiles.js";

export type LocalAgentFailureCode =
  | "usage_limit"
  | "rate_limited"
  | "provider_unavailable"
  | "temporary_failure"
  | "authentication_failed"
  | "invalid_configuration"
  | "policy_denied"
  | "agent_failure";

export interface LocalAgentFailureRecord {
  id: string;
  provider: string;
  status: string;
  failureCode?: LocalAgentFailureCode;
  error?: string;
  updatedAt: string;
}

export interface LocalAgentProviderCooldown {
  provider: LocalAgentProvider;
  failureCode: "usage_limit" | "rate_limited";
  retryAt: string;
  sourceAgentId: string;
}

const LOCAL_AGENT_FAILURE_CODES = new Set<LocalAgentFailureCode>([
  "usage_limit",
  "rate_limited",
  "provider_unavailable",
  "temporary_failure",
  "authentication_failed",
  "invalid_configuration",
  "policy_denied",
  "agent_failure",
]);

const DEFAULT_USAGE_LIMIT_COOLDOWN_MS = 5 * 60 * 1_000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60 * 1_000;

export class LocalAgentFailure extends Error {
  readonly code: LocalAgentFailureCode;
  readonly provider?: LocalAgentProvider;
  readonly retryAt?: string;

  constructor(
    code: LocalAgentFailureCode,
    message: string,
    options: {
      provider?: LocalAgentProvider;
      retryAt?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LocalAgentFailure";
    this.code = code;
    this.provider = options.provider;
    this.retryAt = options.retryAt;
  }
}

export function isLocalAgentFailureCode(value: unknown): value is LocalAgentFailureCode {
  return typeof value === "string" && LOCAL_AGENT_FAILURE_CODES.has(value as LocalAgentFailureCode);
}

export function normalizeLocalAgentFailure(
  provider: LocalAgentProvider | undefined,
  error: unknown,
  now = Date.now(),
): LocalAgentFailure {
  if (error instanceof LocalAgentFailure) return error;

  const details = collectErrorDetails(error);
  const code = classifyLocalAgentFailure(details);
  const retryAt = retryAtForLocalAgentFailure(code, details.message, now);
  return new LocalAgentFailure(code, details.message, {
    provider,
    retryAt,
    cause: error,
  });
}

export function retryAtForLocalAgentFailure(
  code: LocalAgentFailureCode,
  message: string | undefined,
  referenceTime = Date.now(),
): string | undefined {
  if (code !== "usage_limit" && code !== "rate_limited") return undefined;
  const parsed = message ? parseRetryAt(message, referenceTime) : undefined;
  const retryAt = parsed ?? referenceTime + (
    code === "usage_limit"
      ? DEFAULT_USAGE_LIMIT_COOLDOWN_MS
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS
  );
  return new Date(retryAt).toISOString();
}

export function findActiveLocalAgentProviderCooldown(
  records: readonly LocalAgentFailureRecord[],
  provider: LocalAgentProvider,
  now = Date.now(),
): LocalAgentProviderCooldown | undefined {
  let latest: { record: LocalAgentFailureRecord; at: number } | undefined;

  for (const record of records) {
    if (record.provider !== provider) continue;
    const updatedAt = Date.parse(record.updatedAt);
    if (!Number.isFinite(updatedAt)) continue;
    if (!latest || updatedAt > latest.at) latest = { record, at: updatedAt };
  }

  if (!latest || latest.record.status !== "error" || !latest.record.error) return undefined;
  const normalized = normalizeLocalAgentFailure(provider, latest.record.error, latest.at);
  const code = latest.record.failureCode ?? normalized.code;
  if (code !== "usage_limit" && code !== "rate_limited") return undefined;
  const retryAt = retryAtForLocalAgentFailure(
    code,
    latest.record.error,
    latest.at,
  );
  if (!retryAt || Date.parse(retryAt) <= now) return undefined;
  return {
    provider,
    failureCode: code,
    retryAt,
    sourceAgentId: latest.record.id,
  };
}

interface ErrorDetails {
  message: string;
  searchable: string;
  status?: number;
}

function classifyLocalAgentFailure(details: ErrorDetails): LocalAgentFailureCode {
  const text = details.searchable;
  if (
    /\busage[-_ ]limit(?: has been)?[-_ ]?(?:reached|exceeded)?\b/.test(text)
    || /\bhit (?:your|the) usage limit\b/.test(text)
    || /\bweekly[-_ ]limit(?: has been)?[-_ ]reached\b/.test(text)
    || /\b(?:insufficient[-_ ])?quota(?: has been)?[-_ ]?(?:reached|exceeded|exhausted)\b/.test(text)
    || /\bweighted tokens? left\b/.test(text)
  ) {
    return "usage_limit";
  }

  if (
    details.status === 429
    || /\brate[-_ ]?limit(?:ed|ing)?\b/.test(text)
    || /\btoo many requests\b/.test(text)
  ) {
    return "rate_limited";
  }

  if (
    details.status === 401
    || details.status === 403
    || /\bunauthori[sz]ed\b/.test(text)
    || /\bauthentication (?:failed|required)\b/.test(text)
    || /\binvalid (?:api )?key\b/.test(text)
    || /\bnot logged in\b/.test(text)
    || /\blogin required\b/.test(text)
  ) {
    return "authentication_failed";
  }

  if (
    /\bpermission denied\b/.test(text)
    || /\bpolicy denied\b/.test(text)
    || /\boperation ["']?delegate_write["']?\b/.test(text)
    || /\bapproval (?:required|denied)\b/.test(text)
  ) {
    return "policy_denied";
  }

  if (
    /\binvalid configuration\b/.test(text)
    || /\bconfiguration error\b/.test(text)
    || /\bunsupported model\b/.test(text)
    || /\bmodel (?:is )?not found\b/.test(text)
    || /\bunknown model\b/.test(text)
    || /\bmissing (?:required )?(?:environment variable|configuration)\b/.test(text)
  ) {
    return "invalid_configuration";
  }

  if (
    /\benoent\b/.test(text)
    || /\bexecutable not found\b/.test(text)
    || /\bpackage not found\b/.test(text)
    || /\bprovider (?:(?:is )?not available|unavailable)\b/.test(text)
    || /\bprovider preflight failed\b/.test(text)
  ) {
    return "provider_unavailable";
  }

  if (
    (details.status !== undefined && details.status >= 500 && details.status <= 599)
    || /\btemporar(?:y|ily) unavailable\b/.test(text)
    || /\bservice unavailable\b/.test(text)
    || /\boverloaded\b/.test(text)
    || /\btimeout\b/.test(text)
    || /\btimed? out\b/.test(text)
    || /\betimedout\b/.test(text)
    || /\beconnreset\b/.test(text)
    || /\beconnrefused\b/.test(text)
    || /\bsocket hang up\b/.test(text)
  ) {
    return "temporary_failure";
  }

  return "agent_failure";
}

function parseRetryAt(message: string, referenceTime: number): number | undefined {
  const iso = message.match(/\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2}))\b/i)?.[1];
  if (iso) {
    const parsed = Date.parse(iso);
    if (Number.isFinite(parsed) && parsed > referenceTime) return parsed;
  }

  const relative = message.match(
    /(?:try again|retry|resets?)\s+(?:after|in)\s+((?:\d+\s*(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*)+)/i,
  )?.[1];
  if (relative) {
    let seconds = 0;
    for (const match of relative.matchAll(
      /(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi,
    )) {
      const value = Number(match[1]);
      const unit = match[2].toLocaleLowerCase("en-US");
      if (unit.startsWith("h")) seconds += value * 60 * 60;
      else if (unit.startsWith("m")) seconds += value * 60;
      else seconds += value;
    }
    const milliseconds = seconds * 1_000;
    if (milliseconds > 0) return referenceTime + milliseconds;
  }

  const clock = message.match(
    /(?:try again|retry|resets?)\s+(?:at|after)\s+(\d{1,2}):(\d{2})(?:\s*([ap]m))?/i,
  );
  if (!clock) return undefined;
  let hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (hour > 23 || minute > 59) return undefined;
  const meridiem = clock[3]?.toLocaleLowerCase("en-US");
  if (meridiem) {
    if (hour < 1 || hour > 12) return undefined;
    hour %= 12;
    if (meridiem === "pm") hour += 12;
  }
  const reference = new Date(referenceTime);
  const candidate = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    hour,
    minute,
    0,
    0,
  );
  if (candidate.getTime() <= referenceTime) candidate.setDate(candidate.getDate() + 1);
  return candidate.getTime();
}

function collectErrorDetails(error: unknown): ErrorDetails {
  const values: unknown[] = [];
  const seen = new Set<unknown>();
  let status: number | undefined;

  const visit = (value: unknown): void => {
    if (value === null || value === undefined || seen.has(value)) return;
    seen.add(value);
    if (typeof value === "string" || typeof value === "number") {
      values.push(value);
      return;
    }
    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;
    for (const key of ["message", "code", "type", "name", "error", "detail"]) {
      if (record[key] !== undefined) values.push(record[key]);
    }
    for (const key of ["status", "statusCode", "httpStatus"]) {
      const candidate = numericStatus(record[key]);
      if (candidate !== undefined) status ??= candidate;
    }
    visit(record.error);
    visit(record.data);
    visit(record.cause);
    visit(record.response);
  };

  visit(error);
  const collectedMessage = values.find((value): value is string =>
    typeof value === "string" && value.trim().length > 0
  );
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : collectedMessage ?? String(error);
  const searchable = [message, ...values.map(String)].join(" ").toLocaleLowerCase("en-US");
  return { message, searchable, status };
}

function numericStatus(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string" || !/^\d{3}$/.test(value)) return undefined;
  return Number(value);
}
