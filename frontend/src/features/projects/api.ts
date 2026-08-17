import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Project } from './types';

export const projectKeys = {
  all: ['projects'] as const,
  detail: (name: string) => ['projects', name] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => api.get<Project[]>('/projects'),
  });
}

export function useProject(name: string) {
  return useQuery({
    queryKey: projectKeys.detail(name),
    queryFn: () => api.get<Project>(`/projects/${encodeURIComponent(name)}`),
    enabled: Boolean(name),
  });
}

/**
 * Status changes (Reopen / Mark Cancelled) from the row menu.
 *
 * Note ERPNext will silently ignore an attempt to set "Completed" -- that
 * status is derived from checklist and payment state on the server, not chosen
 * by hand. See the PUT handler in backend/src/routes/projects.ts.
 */
export function useUpdateProjectStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, status }: { name: string; status: string }) =>
      api.put<Project>(`/projects/${encodeURIComponent(name)}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}
