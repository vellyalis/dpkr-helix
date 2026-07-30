const FORBIDDEN_SENSITIVE_CONTENT_PATTERNS = [
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /(?:^|[\s,{"'])(?:password|passwd|secret|client[_-]?secret|owner[_-]?token|dashboard[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|authorization|cookie|csrf)["']?\s*[:=]\s*["']?[^\s,}]{6,}/i,
  /[?#](?:[^#\s&]*&)*(?:token|access_token|refresh_token|code|key|secret)=/i,
  /(?:^|\n)\s*(?:user|assistant|system)\s*:/i,
  /\b(?=[A-Za-z0-9_-]{80,}\b)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/,
] as const;

export interface RedactedSensitiveContent {
  value: string;
  redacted: boolean;
}

export function redactForbiddenSensitiveContent(value: string): RedactedSensitiveContent {
  for (const pattern of FORBIDDEN_SENSITIVE_CONTENT_PATTERNS) {
    if (pattern.test(value)) {
      return {
        value: "[redacted sensitive output]",
        redacted: true,
      };
    }
  }
  return { value, redacted: false };
}

export function assertNoForbiddenSensitiveContent(
  owner: string,
  fields: ReadonlyArray<readonly [string, string]>,
): void {
  for (const [field, value] of fields) {
    for (const pattern of FORBIDDEN_SENSITIVE_CONTENT_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(`${owner} ${field} contains forbidden secret-like or transcript content.`);
      }
    }
  }
}
