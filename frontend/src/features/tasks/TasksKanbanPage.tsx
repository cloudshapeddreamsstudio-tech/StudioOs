import { useMemo, useState } from 'react';
import { useTasks, useUpdateTaskStatus, type Task } from './api';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate } from '@/lib/format';

/**
 * Task board — the port of `tasks-kanban.html`.
 *
 * Columns are ERPNext's own Task statuses. Moving a card issues a status
 * change; there is no separate board state to keep in sync, which is why the
 * old page could never drift from ERPNext and neither can this one.
 *
 * Drag-and-drop is deliberately not implemented: the old page didn't have it
 * either (its Alpine board was display-only), and adding it would mean picking
 * a DnD library and inventing interaction the owner hasn't asked for. Each card
 * carries a status dropdown instead, which does the same job with less to break
 * on a phone.
 */

const COLUMNS = ['Open', 'Working', 'Pending Review', 'Overdue', 'Completed'] as const;

const COLUMN_STYLE: Record<string, string> = {
  Open: 'border-t-sky-500',
  Working: 'border-t-violet-500',
  'Pending Review': 'border-t-amber-500',
  Overdue: 'border-t-red-500',
  Completed: 'border-t-green-500',
};

export function TasksKanbanPage() {
  const { data, isLoading, error } = useTasks();
  const updateStatus = useUpdateTaskStatus();
  const [project, setProject] = useState('All');

  const all = useMemo(() => data ?? [], [data]);

  const projects = useMemo(() => {
    const present = new Set(all.map((t) => t.project).filter(Boolean) as string[]);
    return ['All', ...[...present].sort()];
  }, [all]);

  const tasks = useMemo(
    () => (project === 'All' ? all : all.filter((t) => t.project === project)),
    [all, project],
  );

  /** Any status ERPNext returns that isn't a known column gets its own. */
  const columns = useMemo(() => {
    const extra = [...new Set(tasks.map((t) => t.status))].filter(
      (s) => !COLUMNS.includes(s as never),
    );
    return [...COLUMNS, ...extra.sort()];
  }, [tasks]);

  return (
    <>
      <PageHeader title="Tasks">
        <select
          className="form-select"
          value={project}
          onChange={(e) => setProject(e.target.value)}
          aria-label="Filter by project"
        >
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </PageHeader>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          Couldn&apos;t load tasks: {(error as Error).message}
        </div>
      )}

      {isLoading && <div className="text-center text-gray-400 py-12">Loading…</div>}

      {!isLoading && !error && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {columns.map((col) => {
              const inColumn = tasks.filter((t) => t.status === col);
              return (
                <div
                  key={col}
                  className={`w-72 shrink-0 bg-white dark:bg-gray-800 rounded-xl border
                              border-gray-200 dark:border-gray-700/60 border-t-4 ${
                                COLUMN_STYLE[col] ?? 'border-t-gray-400'
                              }`}
                >
                  <header className="px-4 py-3 flex items-center justify-between">
                    <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">
                      {col}
                    </span>
                    <span className="text-xs text-gray-400">{inColumn.length}</span>
                  </header>

                  <div className="px-3 pb-3 space-y-2 max-h-[70vh] overflow-y-auto">
                    {inColumn.length === 0 && (
                      <div className="text-xs text-gray-400 text-center py-6">Nothing here</div>
                    )}
                    {inColumn.map((t) => (
                      <TaskCard
                        key={t.name}
                        task={t}
                        columns={columns}
                        pending={updateStatus.isPending}
                        onMove={(status) => updateStatus.mutate({ name: t.name, status })}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function TaskCard({
  task,
  columns,
  pending,
  onMove,
}: {
  task: Task;
  columns: string[];
  pending: boolean;
  onMove: (status: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 p-3 bg-gray-50 dark:bg-gray-900/30">
      <div className="text-sm text-gray-800 dark:text-gray-100 font-medium">
        {task.is_milestone ? <span className="text-violet-500 mr-1">◆</span> : null}
        {task.subject}
      </div>
      <div className="text-xs text-gray-400 mt-1">
        {task.project ?? 'Unassigned'}
        {task.exp_end_date ? ` · due ${formatDate(task.exp_end_date)}` : ''}
      </div>
      <select
        className="form-select w-full mt-2 text-xs py-1"
        value={task.status}
        disabled={pending}
        onChange={(e) => onMove(e.target.value)}
        aria-label={`Change status of ${task.subject}`}
      >
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
