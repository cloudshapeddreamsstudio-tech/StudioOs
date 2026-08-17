import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { projectKeys } from './api';
import { projectDetailKeys } from './detailApi';
import type { ProjectFormOutput } from './projectSchema';

/** Options for the form's pickers. Each is a plain read, on the user's token. */

interface Named {
  name: string;
}

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get<(Named & { customer_name?: string })[]>('/customers'),
    staleTime: 5 * 60_000,
  });
}

export function useProjectTypes() {
  return useQuery({
    queryKey: ['project-types'],
    queryFn: () => api.get<Named[]>('/project-types'),
    staleTime: 5 * 60_000,
  });
}

export function useProjectTemplates() {
  return useQuery({
    queryKey: ['project-templates'],
    queryFn: () => api.get<Named[]>('/project-templates'),
    staleTime: 5 * 60_000,
  });
}

export function useSalesPersons() {
  return useQuery({
    queryKey: ['sales-persons'],
    queryFn: () => api.get<Named[]>('/sales-persons'),
    staleTime: 5 * 60_000,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: ProjectFormOutput) => api.post<{ name: string }>('/projects', values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateProject(name: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: ProjectFormOutput) =>
      api.put<{ name: string }>(`/projects/${encodeURIComponent(name)}`, values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.all });
      void qc.invalidateQueries({ queryKey: projectDetailKeys.detail(name) });
    },
  });
}

/**
 * Turn a rejection into something a person can act on.
 *
 * Two very different failures arrive at the same place and must not read the
 * same. ERPNext refusing on permissions is the studio's own access rules
 * working — the answer is "ask your administrator", never "try again". A
 * validation complaint is a field to fix. Everything else is a genuine fault.
 *
 * Frappe puts its human-readable complaint in `_server_messages`, a
 * JSON-encoded array of JSON-encoded objects, which is why this is fiddlier
 * than it looks.
 */
export function describeSaveError(error: unknown): { message: string; kind: 'denied' | 'invalid' | 'failed' } {
  if (!(error instanceof ApiError)) {
    return { message: 'Something went wrong saving this project.', kind: 'failed' };
  }

  if (error.isForbidden) {
    return {
      message:
        serverMessage(error.details) ??
        "You don't have permission to change projects in ERPNext. Ask whoever administers your studio's ERPNext.",
      kind: 'denied',
    };
  }

  if (error.status === 400 || error.status === 417) {
    return { message: serverMessage(error.details) ?? error.message, kind: 'invalid' };
  }

  return { message: error.message, kind: 'failed' };
}

function serverMessage(details: unknown): string | null {
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
