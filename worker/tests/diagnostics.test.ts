import { describe, it, expect, spyOn, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { errorHandler } from '../src/middleware/errorHandler';
import { FrappeError, NotFoundError, ValidationError } from '../src/lib/errors';
import type { AppEnv } from '../src/types';
// The app has no test runner of its own. This rule is pure, so it is tested
// here. See the note in app/src/lib/retry.ts.
import { shouldRetry } from '../../app/src/lib/retry';

/**
 * Section 6 of docs/INCIDENT-2026-10-04-schema-skew.md: three faults that did
 * not cause the incident and made it slow to find.
 */

function appThatThrows(err: Error) {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.get('/api/projects', () => {
    throw err;
  });
  return app;
}

/** What ERPNext sent on 2026-10-04, trimmed. */
const refusal = new FrappeError(417, {
  exception: 'frappe.exceptions.DataError: Field not permitted in query: custom_sales_person',
  exc_type: 'DataError',
});

describe('6.1 the Worker logs the reason that ERPNext gives', () => {
  const logged: unknown[][] = [];
  const spy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  afterEach(() => {
    logged.length = 0;
    spy.mockClear();
  });
  const text = () => logged.map((l) => l.map(String).join(' ')).join('\n');

  it('logs the status, the path and the exception text of a 417', async () => {
    const res = await appThatThrows(refusal).request('/api/projects');
    expect(res.status).toBe(417);
    expect(logged).toHaveLength(1);
    expect(text()).toContain('417');
    expect(text()).toContain('/api/projects');
    // The line that would have named the field in one minute.
    expect(text()).toContain('Field not permitted in query: custom_sales_person');
  });

  it('still sends the reason to the browser', async () => {
    const res = await appThatThrows(refusal).request('/api/projects');
    const body = (await res.json()) as { error: string; details: { exception: string } };
    expect(body.error).toBe('ERPNext API error 417');
    expect(body.details.exception).toContain('custom_sales_person');
  });

  it('does not log 401, 403 or 404: each is a normal answer, not a fault', async () => {
    for (const status of [401, 403, 404]) {
      await appThatThrows(new FrappeError(status, { exception: 'x' })).request('/api/projects');
    }
    await appThatThrows(new NotFoundError('Project')).request('/api/projects');
    expect(logged).toHaveLength(0);
  });

  it('does not log an error that StudioOS made itself', async () => {
    // A validation error is the fault of the request, and its text can hold
    // what a person typed.
    await appThatThrows(new ValidationError('customer is required')).request('/api/projects');
    expect(logged).toHaveLength(0);
  });

  it('logs a 5xx from ERPNext too', async () => {
    await appThatThrows(new FrappeError(502, 'Bad Gateway')).request('/api/projects');
    expect(logged).toHaveLength(1);
    expect(text()).toContain('502');
  });

  it('keeps a long exception text short', async () => {
    const long = new FrappeError(417, { exception: `DataError: ${'x'.repeat(5000)}` });
    await appThatThrows(long).request('/api/projects');
    expect(text().length).toBeLessThan(700);
  });
});

describe('6.3 the app does not retry a request that got a 4xx', () => {
  const failed = (status: number) => ({ status });

  it('does not retry any 4xx: the same request gets the same refusal', () => {
    for (const status of [400, 401, 403, 404, 409, 417, 422, 429]) {
      expect(shouldRetry(0, failed(status))).toBe(false);
    }
  });

  it('retries a 5xx one time, and a network failure one time', () => {
    expect(shouldRetry(0, failed(500))).toBe(true);
    expect(shouldRetry(0, failed(502))).toBe(true);
    expect(shouldRetry(0, new Error('Failed to fetch'))).toBe(true);
    expect(shouldRetry(1, failed(500))).toBe(false);
    expect(shouldRetry(1, new Error('Failed to fetch'))).toBe(false);
  });
});
