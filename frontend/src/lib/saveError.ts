import { ApiError } from './api';

/**
 * Turning a rejected write into something a person can act on.
 *
 * Written for the project form and moved here the moment the client form
 * needed it, rather than copied — the old app had `statusBadgeClass` defined
 * separately on each page and the copies had quietly drifted apart. One of
 * these is enough.
 *
 * Three very different failures arrive at the same place and must not read the
 * same:
 *
 *  - **denied** — ERPNext refused on permissions. That is the studio's own
 *    access rules working correctly. The answer is "ask your administrator",
 *    never "try again", and never a red fault message that makes an owner widen
 *    permissions to make it go away.
 *  - **invalid** — a field to fix, in ERPNext's own words.
 *  - **failed** — a genuine fault.
 */
export type SaveErrorKind = 'denied' | 'invalid' | 'failed';

export interface SaveError {
  message: string;
  kind: SaveErrorKind;
}

export function describeSaveError(
  error: unknown,
  copy: { failed: string; denied: string },
): SaveError {
  if (!(error instanceof ApiError)) {
    return { message: copy.failed, kind: 'failed' };
  }

  if (error.isForbidden) {
    return { message: serverMessage(error.details) ?? copy.denied, kind: 'denied' };
  }

  // 417 is Frappe's own validation status, not a fault.
  if (error.status === 400 || error.status === 417) {
    return { message: serverMessage(error.details) ?? error.message, kind: 'invalid' };
  }

  return { message: error.message, kind: 'failed' };
}

/**
 * Frappe puts its human-readable complaint in `_server_messages`: a
 * JSON-encoded array of JSON-encoded objects. Hence the double parse.
 */
export function serverMessage(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const raw = (details as { _server_messages?: unknown })._server_messages;
  if (typeof raw !== 'string') return null;

  try {
    const list = JSON.parse(raw) as unknown[];
    const first = list[0];
    if (typeof first !== 'string') return null;
    const parsed = JSON.parse(first) as { message?: string };
    // Frappe's messages carry markup; strip it rather than render it.
    return parsed.message ? parsed.message.replace(/<[^>]*>/g, '').trim() : null;
  } catch {
    return null;
  }
}
