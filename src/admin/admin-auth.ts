import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export interface AdminSession {
  id: string;
  csrfToken: string;
  expiresAt: number;
}

export interface AdminAuthOptions {
  token?: string;
  host: string;
  port: number;
  now?: () => number;
  createRandom?: (bytes: number) => string;
}

const SESSION_COOKIE = "devspace_admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export class AdminAuth {
  private readonly sessions = new Map<string, AdminSession>();
  private readonly now: () => number;
  private readonly createRandom: (bytes: number) => string;

  constructor(private readonly options: AdminAuthOptions) {
    this.now = options.now ?? Date.now;
    this.createRandom = options.createRandom ?? ((bytes) => randomBytes(bytes).toString("base64url"));
  }

  createSession(token: string): AdminSession | undefined {
    if (!this.options.token || !constantTimeEqual(token, this.options.token)) return undefined;
    const session: AdminSession = {
      id: this.createRandom(32),
      csrfToken: this.createRandom(32),
      expiresAt: this.now() + SESSION_TTL_MS,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  clearSession(req: Request, res: Response): void {
    const id = readCookie(req, SESSION_COOKIE);
    if (id) this.sessions.delete(id);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
  }

  setSessionCookie(res: Response, session: AdminSession): void {
    res.cookie(SESSION_COOKIE, session.id, cookieOptions());
  }

  requireRead(req: Request, res: Response, next: NextFunction): void {
    if (!this.validateHost(req)) {
      res.status(403).json(apiError("FORBIDDEN", "Forbidden"));
      return;
    }
    if (!this.getSession(req)) {
      res.status(401).json(apiError("UNAUTHORIZED", "Unauthorized"));
      return;
    }
    next();
  }

  requireMutation(req: Request, res: Response, next: NextFunction): void {
    if (!this.validateHost(req) || !this.validateOrigin(req)) {
      res.status(403).json(apiError("FORBIDDEN", "Forbidden"));
      return;
    }
    if (req.method !== "DELETE" && !String(req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      res.status(415).json(apiError("JSON_REQUIRED", "JSON content type is required."));
      return;
    }

    const session = this.getSession(req);
    if (!session || req.header("x-devspace-csrf") !== session.csrfToken) {
      res.status(401).json(apiError("UNAUTHORIZED", "Unauthorized"));
      return;
    }
    next();
  }

  getSession(req: Request): AdminSession | undefined {
    const id = readCookie(req, SESSION_COOKIE);
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (!session) return undefined;
    if (session.expiresAt <= this.now()) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  validateHost(req: Request): boolean {
    const host = req.header("host");
    return host === `${this.options.host}:${this.options.port}` || host === `localhost:${this.options.port}`;
  }

  validateOrigin(req: Request): boolean {
    const origin = req.header("origin");
    return origin === `http://${this.options.host}:${this.options.port}` || origin === `http://localhost:${this.options.port}`;
  }
}

export function constantTimeEqual(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function apiError(code: string, message: string, details?: unknown): { ok: false; error: { code: string; message: string; details?: unknown } } {
  return { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } };
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: false,
    path: "/",
  };
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.header("cookie");
  if (!raw) return undefined;
  for (const entry of raw.split(";")) {
    const [key, ...value] = entry.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
