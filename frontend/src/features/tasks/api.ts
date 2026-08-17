import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Task {
  name: string;
  subject: string;
  project: string | null;
  status: string;
  priority: string | null;
  exp_start_date: string | null;
  exp_end_date: string | null;
  is_milestone: number;
  is_group: number;
}

export const taskKeys = { all: ['tasks'] as const };

export function useTasks() {
  return useQuery({ queryKey: taskKeys.all, queryFn: () => api.get<Task[]>('/tasks') });
}

/**
 * Moving a card between columns.
 *
 * The server logs a Timeline comment on the project whenever status actually
 * changes, stamped with ERPNext's own clock — so the activity feed stays in
 * true chronological order even when the owner is catching up on work finished
 * days ago.
 */
export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, status }: { name: string; status: string }) =>
      api.put<Task>(`/tasks/${encodeURIComponent(name)}`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
}
