import { FrappeError, AppError } from './errors';
import type { Env } from '../types';

/**
 * The one place that knows how to talk to ERPNext's REST API.
 *
 * Ported from the old `server/frappeClient.js`. The behaviour is identical;
 * the only structural change is that config arrives as an argument instead of
 * being read from `process.env`, because Workers have no ambient environment --
 * bindings are per-request.
 *
 * ERPNext credentials never reach the browser. Every call in this file runs
 * inside the Worker.
 */

export interface ListOptions {
  fields?: string[];
  filters?: unknown[][];
  limit?: number;
  orderBy?: string;
}

export interface FrappeClient {
  request<T = unknown>(path: string, options?: RequestInit): Promise<T>;
  getList<T = Record<string, unknown>>(doctype: string, opts?: ListOptions): Promise<T[]>;
  getDoc<T = Record<string, unknown>>(doctype: string, name: string): Promise<T>;
  createDoc<T = Record<string, unknown>>(doctype: string, fields: Record<string, unknown>): Promise<T>;
  updateDoc<T = Record<string, unknown>>(
    doctype: string,
    name: string,
    fields: Record<string, unknown>,
  ): Promise<T>;
  deleteDoc(doctype: string, name: string): Promise<unknown>;
  uploadFile(
    file: ArrayBuffer,
    filename: string,
    opts: { doctype: string; docname: string; isPrivate?: boolean },
  ): Promise<unknown>;
  downloadFile(fileUrl: string): Promise<{ buffer: ArrayBuffer; contentType: string | null }>;
}

export function createFrappeClient(env: Env): FrappeClient {
  const baseUrl = (env.FRAPPE_URL || '').replace(/\/+$/, '');

  if (!baseUrl || !env.FRAPPE_API_KEY || !env.FRAPPE_API_SECRET) {
    throw new AppError(
      'Worker is missing FRAPPE_URL / FRAPPE_API_KEY / FRAPPE_API_SECRET. ' +
        'Set them in wrangler.toml (url) and via `wrangler secret put` (key, secret).',
      500,
    );
  }

  const authHeader = `token ${env.FRAPPE_API_KEY}:${env.FRAPPE_API_SECRET}`;

  async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = text;
    }

    if (!res.ok) throw new FrappeError(res.status, data);
    return data as T;
  }

  /** Unwraps Frappe's `{ data: ... }` envelope, which some endpoints omit. */
  function unwrap<T>(result: unknown): T {
    if (result && typeof result === 'object' && 'data' in result) {
      return (result as { data: T }).data;
    }
    return result as T;
  }

  return {
    request,

    async getList<T = Record<string, unknown>>(doctype: string, opts: ListOptions = {}): Promise<T[]> {
      const { fields = ['name'], filters = [], limit = 100, orderBy = 'modified desc' } = opts;
      const params = new URLSearchParams();
      params.set('fields', JSON.stringify(fields));
      if (filters.length) params.set('filters', JSON.stringify(filters));
      params.set('limit_page_length', String(limit));
      params.set('order_by', orderBy);
      const result = await request(`/api/resource/${encodeURIComponent(doctype)}?${params.toString()}`);
      return unwrap<T[]>(result);
    },

    async getDoc<T = Record<string, unknown>>(doctype: string, name: string): Promise<T> {
      const result = await request(
        `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
      );
      return unwrap<T>(result);
    },

    async createDoc<T = Record<string, unknown>>(
      doctype: string,
      fields: Record<string, unknown>,
    ): Promise<T> {
      const result = await request(`/api/resource/${encodeURIComponent(doctype)}`, {
        method: 'POST',
        body: JSON.stringify(fields),
      });
      return unwrap<T>(result);
    },

    async updateDoc<T = Record<string, unknown>>(
      doctype: string,
      name: string,
      fields: Record<string, unknown>,
    ): Promise<T> {
      const result = await request(
        `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
        { method: 'PUT', body: JSON.stringify(fields) },
      );
      return unwrap<T>(result);
    },

    async deleteDoc(doctype: string, name: string): Promise<unknown> {
      const result = await request(
        `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      );
      return unwrap(result);
    },

    /**
     * Frappe's upload_file takes multipart form data, not JSON, so this
     * bypasses `request` rather than extending it. The old Node version had
     * two variants (one reading from disk, one from a Buffer); Workers have no
     * filesystem, so only the in-memory form survives.
     */
    async uploadFile(file, filename, { doctype, docname, isPrivate = true }) {
      const form = new FormData();
      form.set('is_private', isPrivate ? '1' : '0');
      form.set('doctype', doctype);
      form.set('docname', docname);
      form.set('file', new Blob([file]), filename);

      const res = await fetch(`${baseUrl}/api/method/upload_file`, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: form,
      });

      const text = await res.text();
      let data: unknown;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = text;
      }
      if (!res.ok) throw new FrappeError(res.status, data);
      return (data as { message?: unknown }).message ?? data;
    },

    /**
     * Fetch a (possibly private) file's bytes through our own authenticated
     * call, so the browser never needs ERPNext credentials to view it.
     */
    async downloadFile(fileUrl: string) {
      const res = await fetch(`${baseUrl}${fileUrl}`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new FrappeError(res.status);
      return {
        buffer: await res.arrayBuffer(),
        contentType: res.headers.get('content-type'),
      };
    },
  };
}
