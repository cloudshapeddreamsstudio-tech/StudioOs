import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { describeSaveError as describe, type SaveError } from '@/lib/saveError';
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
 * The mechanics moved to lib/saveError.ts when the client form needed the same
 * thing; only the wording is specific to projects.
 */
export function describeSaveError(error: unknown): SaveError {
  return describe(error, {
    failed: 'Something went wrong saving this project.',
    denied:
      "You don't have permission to change projects in ERPNext. Ask whoever administers your studio's ERPNext.",
  });
}
