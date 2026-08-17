import { useState } from 'react';
import type {
  ProjectDetail,
  DetailTask,
  ActivityEntry,
} from './detailApi';
import { projectFileUrl, useAddNote } from './detailApi';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, TableShell } from '@/components/ui/PageHeader';
import { formatCurrency, formatDate, formatPercent } from '@/lib/format';

/**
 * The tabs of the project detail page.
 *
 * Kept in one module because they are variations on the same thing — a slice of
 * the single `/api/project/:name` aggregate rendered as a table — and splitting
 * six thin components across six files would be filing, not structure.
 */

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-gray-400">{children}</div>;
}

/* ------------------------------------------------------------------ Checklist */

/**
 * Tasks arrive in `lft` order, which is ERPNext's nested-set ordering: a
 * `is_group` row is a phase header and every task after it belongs to that
 * phase until the next header. Rebuilding that grouping here rather than
 * flattening keeps the checklist readable the way the owner authored it.
 */
function groupByPhase(tasks: DetailTask[]) {
  const phases: { phase: string | null; tasks: DetailTask[] }[] = [];
  let current: { phase: string | null; tasks: DetailTask[] } = { phase: null, tasks: [] };

  for (const t of tasks) {
    if (t.is_group) {
      if (current.tasks.length || current.phase) phases.push(current);
      current = { phase: t.subject, tasks: [] };
    } else {
      current.tasks.push(t);
    }
  }
  if (current.tasks.length || current.phase) phases.push(current);
  return phases;
}

/** Milestone tasks carry an invisible HTML-comment marker in their description. */
function isMilestone(t: DetailTask): boolean {
  return Boolean(t.is_milestone) || /<!--milestone-/.test(t.description ?? '');
}

export function ChecklistTab({ data }: { data: ProjectDetail }) {
  const phases = groupByPhase(data.tasks);
  const actionable = data.tasks.filter((t) => !t.is_group);

  if (!actionable.length) {
    return (
      <Card>
        <Empty>
          No checklist on this project. That is not the same as &ldquo;nothing to do&rdquo; — it
          usually means no project template was applied when it was created.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {phases.map((p, i) => (
        <Card key={p.phase ?? `phase-${i}`} title={p.phase ?? 'Tasks'} count={p.tasks.length}>
          <TableShell
            head={
              <tr>
                <th className="px-2 first:pl-5 py-3 text-left">Task</th>
                <th className="px-2 py-3 text-left">Status</th>
                <th className="px-2 last:pr-5 py-3 text-left">Due</th>
              </tr>
            }
          >
            {p.tasks.map((t) => (
              <tr key={t.name}>
                <td className="px-2 first:pl-5 py-3">
                  {isMilestone(t) && <span className="text-violet-500 mr-1.5">◆</span>}
                  <span
                    className={
                      t.status === 'Completed'
                        ? 'text-gray-400 line-through'
                        : 'text-gray-800 dark:text-gray-100'
                    }
                  >
                    {t.subject}
                  </span>
                </td>
                <td className="px-2 py-3">
                  <StatusBadge status={t.status} />
                </td>
                <td className="px-2 last:pr-5 py-3 text-gray-500">
                  {formatDate(t.exp_end_date)}
                </td>
              </tr>
            ))}
          </TableShell>
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- Money */

export function MoneyTab({ data }: { data: ProjectDetail }) {
  const f = data.finance;

  return (
    <div className="space-y-6">
      <Card title="Position">
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Figure label="Sanctioned" value={formatCurrency(f.sanctioned)} />
          <Figure label="Billed" value={formatCurrency(f.billed)} />
          <Figure label="Spent (crew/rental)" value={formatCurrency(f.purchaseCost)} />
          <Figure
            label="Budget remaining"
            value={formatCurrency(f.remaining)}
            tone={f.remaining < 0 ? 'bad' : 'good'}
          />
          <Figure
            label="To collect"
            value={formatCurrency(f.salesOutstanding)}
            tone={f.salesOutstanding > 0 ? 'bad' : 'good'}
          />
          <Figure
            label="To pay"
            value={formatCurrency(f.purchaseOutstanding)}
            tone={f.purchaseOutstanding > 0 ? 'bad' : 'good'}
          />
          <Figure label="Gross margin" value={formatCurrency(f.grossMargin)} />
          <Figure
            label={`Commission (${f.commissionPercent}%)`}
            value={formatCurrency(f.commissionOwed)}
            hint={`on ${formatCurrency(f.commissionBase)}`}
          />
        </div>
        <p className="px-5 pb-4 text-xs text-gray-400">
          &ldquo;To collect&rdquo; and &ldquo;to pay&rdquo; count only submitted invoices — a
          draft hasn&apos;t been sent, so it isn&apos;t money owed yet.
        </p>
      </Card>

      <Card title="Client invoices" count={data.salesInvoices.length}>
        {data.salesInvoices.length === 0 ? (
          <Empty>Nothing invoiced to the client yet.</Empty>
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-2 first:pl-5 py-3 text-left">Invoice</th>
                <th className="px-2 py-3 text-left">Posted</th>
                <th className="px-2 py-3 text-right">Total</th>
                <th className="px-2 py-3 text-right">Outstanding</th>
                <th className="px-2 last:pr-5 py-3 text-left">Status</th>
              </tr>
            }
          >
            {data.salesInvoices.map((i) => (
              <tr key={i.name}>
                <td className="px-2 first:pl-5 py-3">
                  <a
                    className="text-sky-600 dark:text-sky-400 font-medium hover:underline"
                    href={`/api/invoices/${encodeURIComponent(i.name)}/print`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {i.custom_invoice_number || i.name}
                  </a>
                </td>
                <td className="px-2 py-3">{formatDate(i.posting_date)}</td>
                <td className="px-2 py-3 text-right">{formatCurrency(i.grand_total)}</td>
                <td
                  className={`px-2 py-3 text-right font-medium ${
                    Number(i.outstanding_amount) > 0 ? 'text-red-500' : 'text-green-600'
                  }`}
                >
                  {formatCurrency(i.outstanding_amount)}
                </td>
                <td className="px-2 last:pr-5 py-3">
                  <StatusBadge status={i.status} />
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <Card title="Crew & vendor bills" count={data.purchaseInvoices.length}>
        {data.purchaseInvoices.length === 0 ? (
          <Empty>No purchase invoices on this project.</Empty>
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-2 first:pl-5 py-3 text-left">Bill</th>
                <th className="px-2 py-3 text-left">Supplier</th>
                <th className="px-2 py-3 text-right">Total</th>
                <th className="px-2 py-3 text-right">Outstanding</th>
                <th className="px-2 last:pr-5 py-3 text-left">Status</th>
              </tr>
            }
          >
            {data.purchaseInvoices.map((i) => (
              <tr key={i.name}>
                <td className="px-2 first:pl-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                  {i.name}
                </td>
                <td className="px-2 py-3">
                  {i.supplier_name || i.supplier}
                  {i.supplier_group === 'Rental House' && (
                    <span className="ml-2 text-xs text-gray-400">vendor</span>
                  )}
                </td>
                <td className="px-2 py-3 text-right">{formatCurrency(i.grand_total)}</td>
                <td
                  className={`px-2 py-3 text-right font-medium ${
                    Number(i.outstanding_amount) > 0 ? 'text-red-500' : 'text-green-600'
                  }`}
                >
                  {formatCurrency(i.outstanding_amount)}
                </td>
                <td className="px-2 last:pr-5 py-3">
                  <StatusBadge status={i.status} />
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>

      <Card title="Payments" count={data.payments.length}>
        {data.payments.length === 0 ? (
          <Empty>No payments recorded against this project.</Empty>
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-2 first:pl-5 py-3 text-left">Entry</th>
                <th className="px-2 py-3 text-left">Direction</th>
                <th className="px-2 py-3 text-left">Party</th>
                <th className="px-2 py-3 text-right">Amount</th>
                <th className="px-2 last:pr-5 py-3 text-left">State</th>
              </tr>
            }
          >
            {data.payments.map((p) => (
              <tr key={p.name}>
                <td className="px-2 first:pl-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                  {p.name}
                </td>
                <td className="px-2 py-3">{p.payment_type === 'Receive' ? 'In' : 'Out'}</td>
                <td className="px-2 py-3">{p.party_name || p.party}</td>
                <td className="px-2 py-3 text-right">{formatCurrency(p.paid_amount)}</td>
                <td className="px-2 last:pr-5 py-3">
                  <StatusBadge
                    status={
                      p.docstatus === 1 ? 'Paid' : p.docstatus === 2 ? 'Cancelled' : 'Draft'
                    }
                  />
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  const toneClass =
    tone === 'bad' ? 'text-red-500' : tone === 'good' ? 'text-green-600 dark:text-green-500' : '';
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase font-semibold mb-1">{label}</div>
      <div className={`font-bold text-gray-800 dark:text-gray-100 ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- Expenses */

export function ExpensesTab({ data }: { data: ProjectDetail }) {
  const o = data.expenseOverview;
  const m = o.margin;

  return (
    <div className="space-y-6">
      <Card title="Planned vs actual">
        {o.rows.length === 0 ? (
          <Empty>Nothing planned or spent on this project yet.</Empty>
        ) : (
          <>
            <TableShell
              head={
                <tr>
                  <th className="px-2 first:pl-5 py-3 text-left">Category</th>
                  <th className="px-2 py-3 text-right">Planned</th>
                  <th className="px-2 py-3 text-right">Actual</th>
                  <th className="px-2 last:pr-5 py-3 text-right">Variance</th>
                </tr>
              }
            >
              {o.rows.map((r) => {
                const variance = r.planned - r.actual;
                return (
                  <tr key={r.category}>
                    <td className="px-2 first:pl-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                      {r.category}
                    </td>
                    <td className="px-2 py-3 text-right">{formatCurrency(r.planned)}</td>
                    <td className="px-2 py-3 text-right">{formatCurrency(r.actual)}</td>
                    <td
                      className={`px-2 last:pr-5 py-3 text-right ${
                        variance < 0 ? 'text-red-500' : 'text-gray-500'
                      }`}
                    >
                      {formatCurrency(variance)}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold bg-gray-50 dark:bg-gray-900/20">
                <td className="px-2 first:pl-5 py-3">Total</td>
                <td className="px-2 py-3 text-right">{formatCurrency(o.plannedTotal)}</td>
                <td className="px-2 py-3 text-right">{formatCurrency(o.actualTotal)}</td>
                <td className="px-2 last:pr-5 py-3 text-right">
                  {formatCurrency(o.plannedTotal - o.actualTotal)}
                </td>
              </tr>
            </TableShell>
            <p className="px-5 py-3 text-xs text-gray-400">
              Planned comes from the crew roster and per-expense estimates; actual comes from real
              purchase invoices and logged spend. They are sourced independently and neither is
              ever back-filled from the other.
            </p>
          </>
        )}
      </Card>

      <Card title="Margin against sanctioned">
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Figure label="Commission" value={formatCurrency(m.commissionActual)} />
          <Figure label="Production" value={formatCurrency(m.productionActual)} />
          <Figure
            label="Production ceiling"
            value={formatCurrency(m.productionCeilingActual)}
            hint="before profit drops under 20%"
          />
          <Figure
            label="Profit"
            value={formatCurrency(m.profitActual)}
            hint={
              m.profitActualPercent !== null ? formatPercent(m.profitActualPercent) : 'no sanction set'
            }
            tone={m.meetsTargetActual === false ? 'bad' : m.meetsTargetActual ? 'good' : undefined}
          />
        </div>
        {m.meetsTargetActual === false && (
          <div className="mx-5 mb-5 px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-xs">
            Profit is below the 20% of sanctioned the studio aims to clear.
          </div>
        )}
        {m.meetsTargetActual === null && (
          <div className="mx-5 mb-5 px-4 py-3 rounded-lg bg-gray-500/10 text-gray-500 text-xs">
            No sanctioned amount is set on this project, so the margin model has nothing to measure
            against. Percentages are left blank rather than guessed.
          </div>
        )}
      </Card>

      <Card title="Logged expenses" count={data.expenses.length}>
        {data.expenses.length === 0 ? (
          <Empty>No out-of-pocket expenses logged.</Empty>
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-2 first:pl-5 py-3 text-left">Date</th>
                <th className="px-2 py-3 text-left">Category</th>
                <th className="px-2 py-3 text-left">Description</th>
                <th className="px-2 py-3 text-left">Paid by</th>
                <th className="px-2 py-3 text-right">Planned</th>
                <th className="px-2 last:pr-5 py-3 text-right">Actual</th>
              </tr>
            }
          >
            {data.expenses.map((e) => (
              <tr key={e.id}>
                <td className="px-2 first:pl-5 py-3">{formatDate(e.date)}</td>
                <td className="px-2 py-3">{e.category}</td>
                <td className="px-2 py-3 text-gray-500">{e.description || '—'}</td>
                <td className="px-2 py-3">{e.paidBy || '—'}</td>
                <td className="px-2 py-3 text-right text-gray-500">
                  {e.estimatedAmount ? formatCurrency(e.estimatedAmount) : '—'}
                </td>
                <td className="px-2 last:pr-5 py-3 text-right font-medium">
                  {formatCurrency(e.amount)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------- Crew */

export function CrewTab({ data }: { data: ProjectDetail }) {
  const crew = data.crewRoster.filter((c) => c.role === 'Crew');
  const vendors = data.crewRoster.filter((c) => c.role === 'Vendor');

  const table = (rows: typeof crew, title: string) => (
    <Card title={title} count={rows.length}>
      {rows.length === 0 ? (
        <Empty>Nobody on the {title.toLowerCase()} roster.</Empty>
      ) : (
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">Name</th>
              <th className="px-2 py-3 text-left">Role</th>
              <th className="px-2 py-3 text-right">Rate</th>
              <th className="px-2 py-3 text-right">Days</th>
              <th className="px-2 last:pr-5 py-3 text-right">Total</th>
            </tr>
          }
        >
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-2 first:pl-5 py-3 font-medium text-gray-800 dark:text-gray-100">
                {c.name}
                {c.contact && <div className="text-xs text-gray-400">{c.contact}</div>}
              </td>
              <td className="px-2 py-3">{c.designation || '—'}</td>
              <td className="px-2 py-3 text-right">{formatCurrency(c.rate)}</td>
              <td className="px-2 py-3 text-right">{c.days}</td>
              <td className="px-2 last:pr-5 py-3 text-right font-medium">
                {formatCurrency(c.total)}
              </td>
            </tr>
          ))}
        </TableShell>
      )}
    </Card>
  );

  return (
    <div className="space-y-6">
      {table(crew, 'Crew')}
      {table(vendors, 'Vendors')}
      <p className="text-xs text-gray-400">
        The roster is a planning layer, deliberately not tied to purchase invoices — someone can be
        booked here with no bill raised yet, or billed without ever being on the roster.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- Docs */

export function DocsTab({ data }: { data: ProjectDetail }) {
  return (
    <Card title="Documents" count={data.files.length}>
      {data.files.length === 0 ? (
        <Empty>No documents attached to this project.</Empty>
      ) : (
        <TableShell
          head={
            <tr>
              <th className="px-2 first:pl-5 py-3 text-left">File</th>
              <th className="px-2 py-3 text-left">Added</th>
              <th className="px-2 last:pr-5 py-3 text-left">Visibility</th>
            </tr>
          }
        >
          {data.files.map((f) => (
            <tr key={f.name}>
              <td className="px-2 first:pl-5 py-3">
                <a
                  className="text-violet-500 hover:text-violet-600 font-medium"
                  href={projectFileUrl(f.name)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {f.file_name}
                </a>
              </td>
              <td className="px-2 py-3">{formatDate(f.creation?.slice(0, 10))}</td>
              <td className="px-2 last:pr-5 py-3 text-gray-500">
                {f.is_private ? 'Private' : 'Public'}
              </td>
            </tr>
          ))}
        </TableShell>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------- Activity */

/** Notes carry their edit history as struck-through blocks inside the content. */
function renderNote(content: string) {
  return { __html: content };
}

export function ActivityTab({ data }: { data: ProjectDetail }) {
  const [note, setNote] = useState('');
  const addNote = useAddNote(data.project.name);

  return (
    <div className="space-y-6">
      <Card title="Add a note">
        <div className="p-5">
          <textarea
            className="form-input w-full min-h-20"
            placeholder="Something worth remembering about this project…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end mt-3">
            <button
              className="btn-primary"
              disabled={!note.trim() || addNote.isPending}
              onClick={() =>
                addNote.mutate(note.trim(), { onSuccess: () => setNote('') })
              }
            >
              {addNote.isPending ? 'Saving…' : 'Add note'}
            </button>
          </div>
          {addNote.isError && (
            <p className="text-xs text-red-500 mt-2">
              Couldn&apos;t save: {(addNote.error as Error).message}
            </p>
          )}
        </div>
      </Card>

      <Card title="Timeline" count={data.activity.length}>
        {data.activity.length === 0 ? (
          <Empty>Nothing logged on this project yet.</Empty>
        ) : (
          <ol className="p-5 space-y-4">
            {data.activity.map((a: ActivityEntry) => (
              <li key={a.id} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                <div className="text-xs text-gray-400">
                  {formatDate(a.when?.slice(0, 10))} · {a.who}
                  {a.kind === 'communication' && a.medium ? ` · ${a.medium}` : ''}
                </div>
                {a.subject && (
                  <div className="font-medium text-gray-800 dark:text-gray-100 text-sm mt-0.5">
                    {a.subject}
                  </div>
                )}
                <div
                  className="text-sm text-gray-600 dark:text-gray-300 mt-0.5 [&_del]:text-gray-400"
                  dangerouslySetInnerHTML={renderNote(a.content)}
                />
              </li>
            ))}
          </ol>
        )}
      </Card>
      <p className="text-xs text-gray-400">
        Timeline entries are stamped with ERPNext&apos;s own server clock at the moment they are
        recorded — never backdated — so the order here is always the true order things happened.
      </p>
    </div>
  );
}
