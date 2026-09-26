import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  useClientDetail,
  useUpdateClient,
  describeClientSaveError,
  type ClientDetail,
  type ClientEdit,
  type ClientInvoice,
  type ClientProject,
} from './clientDetailApi';
import { PageHeader, StatTile, Card, TableShell } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatCurrencyOrDash, formatDate } from '@/lib/format';

/**
 * One client — the port of `client-detail.html`.
 *
 * The old page's honesty is kept deliberately. Four of its five tabs were
 * visible, clickable, and said what they would eventually hold rather than
 * showing invented data; a tab that lies is worse than a tab that admits it is
 * empty. Those four are still stubs here, in the same words, because nothing
 * behind them has been built.
 *
 * What is *not* kept is the old page's silent zero. It caught every failure
 * loading invoices and substituted an empty list, so a client who owed
 * ₹2,29,000 showed ₹0 outstanding whenever the query failed for any reason —
 * including the CSDS-only `custom_invoice_number` field being absent. The route
 * now returns null for what it could not read, and this page shows a dash and
 * says so.
 */

const TABS = ['Overview', 'Transactions', 'Statement', 'Comments', 'Mails'] as const;
type Tab = (typeof TABS)[number];

/** The old app's own wording, kept so the promise made to the owner is unchanged. */
const COMING_SOON: Record<Exclude<Tab, 'Overview'>, string> = {
  Transactions:
    "Coming soon: a full transactions view listing this client's invoices, customer payments and projects as collapsible sections with quick-jump links.",
  Statement:
    'Coming soon: a printable statement of accounts — opening balance, invoiced, received, and a running-balance ledger — reusing the branded invoice renderer.',
  Comments:
    "Coming soon: an internal notes thread on this client, reusing project detail's add-and-edit-with-history pattern.",
  Mails: 'Coming soon: the email history for this client, once outgoing mail is wired up.',
};

export function ClientDetailPage() {
  const { name = '' } = useParams();
  const { data, isLoading, error } = useClientDetail(name);
  const [tab, setTab] = useState<Tab>('Overview');
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Client" />
        <div className="text-center text-gray-400 py-20">Loading…</div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Client" />
        <div className="px-4 py-3 rounded-lg bg-red-500/10 text-red-600 text-sm">
          Couldn&apos;t load {name}: {(error as Error)?.message ?? 'not found'}
        </div>
        <Link to="/clients" className="text-violet-500 text-sm mt-4 inline-block">
          ← Back to clients
        </Link>
      </>
    );
  }

  const c = data.customer;
  const disabled = Number(c.disabled) === 1;

  return (
    <>
      <Link to="/clients" className="text-sm text-violet-500 hover:underline">
        ← Clients
      </Link>

      <PageHeader title={c.customer_name || c.name}>
        <span
          className={`inline-flex items-center font-medium rounded-full px-2.5 py-1 text-sm ${
            disabled
              ? 'bg-gray-500/20 text-gray-600 dark:text-gray-400'
              : 'bg-green-500/20 text-green-700 dark:text-green-400'
          }`}
        >
          {disabled ? 'Disabled' : 'Active'}
        </span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5
                     text-sm font-medium text-gray-700 dark:text-gray-200
                     hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </PageHeader>

      <div className="text-sm text-gray-500 dark:text-gray-400 -mt-4 mb-6">
        {c.name}
        {c.customer_type ? ` · ${c.customer_type}` : ''}
      </div>

      {editing && (
        <ClientEditForm client={name} data={data} onDone={() => setEditing(false)} />
      )}

      <Totals data={data} />

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700/60 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t
                ? 'border-violet-500 text-violet-500'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <Overview data={data} />
      ) : (
        <div className="text-sm text-gray-400 py-12 text-center max-w-xl mx-auto">
          {COMING_SOON[tab]}
        </div>
      )}
    </>
  );
}

/**
 * Three tiles, each able to say "unknown".
 *
 * `formatCurrencyOrDash` rather than `formatCurrency`, because the latter turns
 * null into ₹0 — all the care in the route is undone in the last inch before
 * the screen otherwise. That trap is recorded in Phase 7b and it is the same
 * one here.
 */
function Totals({ data }: { data: ClientDetail }) {
  const invoices = data.salesInvoices;
  const totalInvoiced = invoices
    ? invoices.reduce((s, i) => s + Number(i.grand_total || 0), 0)
    : null;

  return (
    <div className="grid grid-cols-12 gap-6 mb-6">
      <StatTile
        label="To collect"
        value={formatCurrencyOrDash(data.outstandingReceivables)}
        sub={data.outstandingReceivables === null ? 'Invoices could not be read' : undefined}
        tone={
          data.outstandingReceivables === null
            ? 'neutral'
            : data.outstandingReceivables > 0
              ? 'danger'
              : 'good'
        }
        span={4}
      />
      <StatTile
        label="Total invoiced"
        value={formatCurrencyOrDash(totalInvoiced)}
        sub={totalInvoiced === null ? 'Invoices could not be read' : undefined}
        span={4}
      />
      <StatTile
        label="Projects"
        value={data.projects === null ? '—' : String(data.projects.length)}
        sub={data.projects === null ? 'Projects could not be read' : undefined}
        span={4}
      />
    </div>
  );
}

function Overview({ data }: { data: ClientDetail }) {
  const c = data.customer;
  const addressText = useMemo(() => {
    const a = data.address;
    if (!a) return null;
    const parts = [a.address_line1, a.address_line2, a.city, a.state, a.pincode, a.country];
    const joined = parts.filter(Boolean).join(', ');
    return joined || null;
  }, [data.address]);

  return (
    <div className="grid gap-6">
      <Card title="Contact">
        <dl className="px-5 py-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
          <Detail label="Email" value={c.email_id} />
          <Detail label="Phone" value={c.mobile_no} />
          <Detail label="Primary contact" value={c.customer_primary_contact} />
          <Detail label="Currency" value={c.default_currency || 'INR'} />
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase text-gray-400 mb-1">Billing address</dt>
            <dd className="text-gray-700 dark:text-gray-300">
              {addressText ?? <span className="text-gray-400">No address on file.</span>}
            </dd>
          </div>
        </dl>
      </Card>

      <InvoicesCard invoices={data.salesInvoices} />
      <ProjectsCard projects={data.projects} />
      <ActivityCard invoices={data.salesInvoices} projects={data.projects} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-gray-400 mb-1">{label}</dt>
      <dd className="text-gray-700 dark:text-gray-300">
        {value || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}

/** "Could not be read" and "none yet" are different sentences on purpose. */
function Unreadable({ what }: { what: string }) {
  return (
    <div className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
      <span className="font-semibold text-amber-700 dark:text-amber-500">
        This client&apos;s {what} could not be read.
      </span>{' '}
      That is not the same as having none — your ERPNext either refused the request or does not
      have a field StudioOS asked for, so nothing here is counted rather than counted as zero.
    </div>
  );
}

function InvoicesCard({ invoices }: { invoices: ClientInvoice[] | null }) {
  if (invoices === null) {
    return (
      <Card title="Invoices">
        <Unreadable what="invoices" />
      </Card>
    );
  }

  if (!invoices.length) {
    return (
      <Card title="Invoices" count={0}>
        <div className="px-5 py-6 text-sm text-gray-400">No invoices raised to this client yet.</div>
      </Card>
    );
  }

  return (
    <Card title="Invoices" count={invoices.length}>
      <TableShell
        head={
          <tr>
            <th className="px-2 first:pl-5 py-3 text-left">Invoice</th>
            <th className="px-2 py-3 text-left">Date</th>
            <th className="px-2 py-3 text-right">Total</th>
            <th className="px-2 py-3 text-right">Outstanding</th>
            <th className="px-2 last:pr-5 py-3 text-left">Status</th>
          </tr>
        }
      >
        {invoices.map((i) => (
          <tr key={i.name}>
            <td className="px-2 first:pl-5 py-3">
              <div className="font-medium text-gray-800 dark:text-gray-100">
                {i.custom_invoice_number || i.name}
              </div>
              {i.custom_invoice_number && <div className="text-xs text-gray-400">{i.name}</div>}
            </td>
            <td className="px-2 py-3">{formatDate(i.posting_date)}</td>
            <td className="px-2 py-3 text-right">{formatCurrency(i.grand_total)}</td>
            <td
              className={`px-2 py-3 text-right ${
                Number(i.outstanding_amount) > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'
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
    </Card>
  );
}

function ProjectsCard({ projects }: { projects: ClientProject[] | null }) {
  if (projects === null) {
    return (
      <Card title="Projects">
        <Unreadable what="projects" />
      </Card>
    );
  }

  if (!projects.length) {
    return (
      <Card title="Projects" count={0}>
        <div className="px-5 py-6 text-sm text-gray-400">No projects linked to this client yet.</div>
      </Card>
    );
  }

  return (
    <Card title="Projects" count={projects.length}>
      <TableShell
        head={
          <tr>
            <th className="px-2 first:pl-5 py-3 text-left">Project</th>
            <th className="px-2 py-3 text-left">Status</th>
            <th className="px-2 last:pr-5 py-3 text-left">Shoot / event date</th>
          </tr>
        }
      >
        {projects.map((p) => (
          <tr key={p.name}>
            <td className="px-2 first:pl-5 py-3">
              <Link
                to={`/projects/${encodeURIComponent(p.name)}`}
                className="font-medium text-gray-800 dark:text-gray-100 hover:text-violet-500"
              >
                {p.project_name || p.name}
              </Link>
              {p.custom_brand && <div className="text-xs text-gray-400">{p.custom_brand}</div>}
            </td>
            <td className="px-2 py-3">
              <StatusBadge status={p.status} />
            </td>
            <td className="px-2 last:pr-5 py-3">{formatDate(p.custom_shoot_date)}</td>
          </tr>
        ))}
      </TableShell>
    </Card>
  );
}

/**
 * A timeline derived from what exists, not a stored audit log.
 *
 * There is no note or activity record on Customer, so this merges each
 * invoice's and each project's creation event. The Comments tab above is where
 * a real note thread would go, and it is honestly marked as absent — this is
 * history, not commentary, and the page should not blur the two.
 */
function ActivityCard({
  invoices,
  projects,
}: {
  invoices: ClientInvoice[] | null;
  projects: ClientProject[] | null;
}) {
  const events = useMemo(() => {
    const rows = [
      ...(invoices ?? [])
        .filter((i) => i.creation)
        .map((i) => ({
          key: `inv-${i.name}`,
          when: i.creation as string,
          label: `Invoice ${i.custom_invoice_number || i.name} created — ${formatCurrency(i.grand_total)}`,
        })),
      ...(projects ?? [])
        .filter((p) => p.creation)
        .map((p) => ({
          key: `proj-${p.name}`,
          when: p.creation as string,
          label: `Project ${p.project_name || p.name} started`,
        })),
    ];
    return rows.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [invoices, projects]);

  const partial = invoices === null || projects === null;

  return (
    <Card title="History">
      <div className="px-5 py-4">
        <p className="text-xs text-gray-400 mb-4">
          Derived from invoice and project records — this client has no manual note log yet.
          {partial && ' Part of it could not be read, so this is incomplete.'}
        </p>
        {events.length === 0 ? (
          <div className="text-sm text-gray-400 py-4">No invoice or project history yet.</div>
        ) : (
          <div className="relative pl-5">
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-700/60" />
            {events.map((e) => (
              <div key={e.key} className="relative pb-5">
                <div className="absolute left-[-20px] top-1.5 w-2.5 h-2.5 rounded-full bg-violet-400 border-2 border-white dark:border-gray-800" />
                <div className="text-xs text-gray-400">{formatDate(e.when)}</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{e.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm';

const CUSTOMER_TYPES = ['Company', 'Individual', 'Proprietorship', 'Partnership'] as const;

function ClientEditForm({
  client,
  data,
  onDone,
}: {
  client: string;
  data: ClientDetail;
  onDone: () => void;
}) {
  const update = useUpdateClient(client);
  const a = data.address;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClientEdit>({
    defaultValues: {
      email: data.customer.email_id ?? '',
      phone: data.customer.mobile_no ?? '',
      customerType: data.customer.customer_type ?? 'Company',
      address: {
        address_line1: a?.address_line1 ?? '',
        address_line2: a?.address_line2 ?? '',
        city: a?.city ?? '',
        state: a?.state ?? '',
        pincode: a?.pincode ?? '',
        country: a?.country ?? 'India',
      },
    },
  });

  const rootError = errors.root?.message;
  const denied = errors.root?.type === 'denied';

  const submit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values);
      onDone();
    } catch (err) {
      const { message, kind } = describeClientSaveError(err);
      // Reported on the form so nothing typed is lost.
      setError('root', { type: kind, message });
    }
  });

  return (
    <form onSubmit={submit} className="mb-6">
      {rootError && (
        <div
          role="alert"
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            denied
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          {rootError}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/60 rounded-lg p-5 grid gap-4 sm:grid-cols-2">
        <EditField label="Email">
          <input {...register('email')} className={inputClass} type="email" />
        </EditField>
        <EditField label="Phone">
          <input {...register('phone')} className={inputClass} />
        </EditField>
        <EditField label="Client type">
          <select {...register('customerType')} className={inputClass}>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </EditField>
        <div className="hidden sm:block" />

        <EditField label="Address line 1" span>
          <input {...register('address.address_line1')} className={inputClass} />
        </EditField>
        <EditField label="Address line 2" span>
          <input {...register('address.address_line2')} className={inputClass} />
        </EditField>
        <EditField label="City">
          <input {...register('address.city')} className={inputClass} />
        </EditField>
        <EditField label="State">
          <input {...register('address.state')} className={inputClass} />
        </EditField>
        <EditField label="Pincode">
          <input {...register('address.pincode')} className={inputClass} />
        </EditField>
        <EditField label="Country">
          <input {...register('address.country')} className={inputClass} />
        </EditField>

        <p className="sm:col-span-2 text-xs text-gray-400">
          Email and phone are stored on this client&apos;s ERPNext Contact, not on the Customer
          record itself — ERPNext reads them across from there, so that is where they are saved.
        </p>

        <div className="sm:col-span-2 flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-md bg-violet-500 hover:bg-violet-600 disabled:opacity-60
                       px-4 py-2 text-sm font-semibold text-white"
          >
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2
                       text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function EditField({
  label,
  span,
  children,
}: {
  label: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${span ? 'sm:col-span-2' : ''}`}>
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
