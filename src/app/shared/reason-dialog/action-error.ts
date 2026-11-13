import { ApiError } from '../../core/auth/api-error';

/** Translation key under `reasonDialog.errors` for a refused admin action. */
export type ActionErrorKey =
  'network' | 'forbidden' | 'notFound' | 'conflict' | 'invalid' | 'unavailable' | 'generic';

export interface ActionError {
  readonly key: ActionErrorKey;
  /**
   * The server's machine code (`grant_disable_with_allowance`, `ADMIN_LAST_SUPER`, …), shown under
   * the message: an administrator can quote it, and a code the panel has no text for still says
   * something.
   */
  readonly code: string | null;
}

/** Turns a failed admin change into the line its dialog shows. */
export function describeActionError(error: unknown): ActionError {
  const e = ApiError.from(error);
  return { key: keyOf(e), code: e.code };
}

function keyOf(e: ApiError): ActionErrorKey {
  if (e.isNetworkError) return 'network';
  switch (e.status) {
    case 403:
      return 'forbidden';
    case 404:
      return 'notFound';
    // Someone else changed the object since the screen was read (§6.3, step 9).
    case 409:
      return 'conflict';
    case 400:
    case 422:
      return 'invalid';
    case 502:
    case 503:
    case 504:
      return 'unavailable';
    default:
      return 'generic';
  }
}
