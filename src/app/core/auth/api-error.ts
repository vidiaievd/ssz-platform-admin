import { HttpErrorResponse } from '@angular/common/http';

/**
 * A failed call to the gateway, flattened. auth-service answers `application/problem+json`
 * with a machine `code` (`INVALID_CREDENTIALS`, `ADMIN_ACCESS_DENIED`, …) and, on 423,
 * `lockedUntil`; NestJS services answer `{ statusCode, message, error }` — `message` then
 * stands in for the code when it looks like one.
 */
export class ApiError extends Error {
  constructor(
    /** HTTP status; 0 when the gateway was not reached at all. */
    readonly status: number,
    readonly code: string | null,
    message: string,
    /** When the account is unlocked again (423). */
    readonly lockedUntil: Date | null = null,
    /** Field errors of a validation failure (422), when the server sends them. */
    readonly fieldErrors: Readonly<Record<string, readonly string[]>> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (!(error instanceof HttpErrorResponse)) {
      return new ApiError(0, null, error instanceof Error ? error.message : String(error));
    }

    const body = parseBody(error.error);
    const code = stringField(body, 'code') ?? codeLike(stringField(body, 'message')) ?? null;
    const message =
      stringField(body, 'detail') ??
      stringField(body, 'message') ??
      stringField(body, 'title') ??
      error.message;
    const lockedRaw = stringField(body, 'lockedUntil');
    const locked = lockedRaw ? new Date(lockedRaw) : null;

    return new ApiError(
      error.status,
      code,
      message,
      locked && !Number.isNaN(locked.getTime()) ? locked : null,
      fieldErrors(body),
    );
  }
}

function parseBody(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
}

function stringField(body: Record<string, unknown> | null, key: string): string | null {
  const value = body?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** `SESSION_LIMIT` is a code; `Course not found` is prose. */
function codeLike(value: string | null): string | null {
  return value && /^[A-Z][A-Z0-9_]+$/.test(value) ? value : null;
}

function fieldErrors(
  body: Record<string, unknown> | null,
): Record<string, readonly string[]> | null {
  const errors = body?.['errors'];
  if (typeof errors !== 'object' || errors === null || Array.isArray(errors)) return null;
  const result: Record<string, readonly string[]> = {};
  for (const [field, messages] of Object.entries(errors)) {
    if (Array.isArray(messages)) {
      result[field] = messages.filter((m): m is string => typeof m === 'string');
    }
  }
  return result;
}
