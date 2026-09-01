import { Link, Navigate } from 'react-router-dom';
import { useSession } from '@/features/auth/api';
import { useDarkMode } from '@/lib/useDarkMode';

/**
 * The public front door.
 *
 * `/` used to be inside RequireSession, so a signed-out visit just bounced
 * straight to `/sign-in` with nothing to see -- there was no page to land on
 * before knowing what StudioOS even is. This is that page: what it is, what
 * it's for, why it's different, and a way in.
 *
 * A signed-in visitor is redirected straight to `/dashboard` rather than
 * shown a pitch for a product they already use -- see the guard below and
 * the matching fix in `backend/src/routes/auth.ts`'s OAuth callback, which
 * used to land a fresh sign-in on `/projects` instead of `/dashboard`, a
 * split the owner confirmed was a bug, not two intentional landing points.
 *
 * Same visual language as the in-app `Header` (sticky, blurred, bordered,
 * shared dark-mode toggle) and the `STUDIOOS` wordmark from `SignInPage`,
 * because this is the same product's front door, not a separate site.
 */
export function HomePage() {
  const { data: session, isPending } = useSession();

  // Avoid a flash of marketing content for someone who is already signed in.
  if (isPending) return null;
  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <PublicHeader />
      <Hero />
      <WhatIsStudioOS />
      <Features />
      <Footer />
    </div>
  );
}

/* ----------------------------------------------------------------- Header */

function PublicHeader() {
  const [dark, setDark] = useDarkMode();

  return (
    <header className="sticky top-0 before:absolute before:inset-0 before:backdrop-blur-md before:bg-white/90 dark:before:bg-gray-800/90 before:-z-10 z-30">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 border-b border-gray-200 dark:border-gray-700/60">
          <div className="text-xs font-bold tracking-[0.2em] text-violet-500">STUDIOOS</div>

          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="hidden sm:inline text-sm font-medium text-gray-500 hover:text-gray-700
                         dark:text-gray-400 dark:hover:text-gray-200"
            >
              Learn more
            </a>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full
                         bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400
                         hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setDark(!dark)}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                  <path d="M7 0h2v2H7V0Zm5.66 1.93 1.41 1.41-1.41 1.42-1.42-1.42 1.42-1.41ZM14 7h2v2h-2V7Zm-1.93 5.66-1.42-1.41 1.42-1.42 1.41 1.42-1.41 1.41ZM7 14h2v2H7v-2Zm-3.34-1.93 1.41-1.42 1.42 1.42-1.42 1.41-1.41-1.41ZM0 7h2v2H0V7Zm1.93-5.07 1.42 1.41L1.93 4.76.52 3.34l1.41-1.41ZM8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                  <path d="M6.2 1.1a7 7 0 1 0 8.7 8.7 6 6 0 0 1-8.7-8.7Z" />
                </svg>
              )}
            </button>
            <Link to="/sign-in" className="btn-primary">
              Login
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------- Hero */

function Hero() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">
          Run your studio, not a spreadsheet.
        </h1>
        <p className="mt-5 text-lg text-gray-500 dark:text-gray-400">
          StudioOS is project, crew, and invoice management for production studios — built
          directly on the ERPNext you already run, not a new system to migrate into.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/sign-in" className="btn-primary px-5 py-2.5 text-base">
            Login
          </Link>
          <a href="#features" className="btn-secondary px-5 py-2.5 text-base">
            Learn more
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- What is this */

function WhatIsStudioOS() {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-16 bg-white dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700/60">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">
          What is StudioOS?
        </h2>
        <div className="mt-6 space-y-4 text-base text-gray-500 dark:text-gray-400 text-left sm:text-center">
          <p>
            Most studios run projects out of a spreadsheet, invoices out of ERPNext, crew
            payments out of a notebook, and cash flow out of memory — four sources of truth
            that never quite agree with each other.
          </p>
          <p>
            StudioOS puts them in one place: a checklist that tracks its own progress, a crew
            roster planned against real purchase orders, invoices that post straight to your own
            books, and a dashboard that shows what's actually outstanding — all built directly on
            top of the ERPNext instance your studio already owns.
          </p>
          <p>
            It's for production studios of any size who want one place to work, not one more
            place to keep updated by hand.
          </p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Features */

interface Feature {
  title: string;
  body: string;
  icon: React.ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: 'Sign in with the ERPNext you already run',
    body: 'No new password to remember, and StudioOS holds none of your data — every request runs on your own account, with your own permissions.',
    icon: (
      <path d="M6.5 2.5H3.2A1.2 1.2 0 0 0 2 3.7v8.6a1.2 1.2 0 0 0 1.2 1.2h3.3M10.5 11 14 8l-3.5-3M14 8H6" />
    ),
  },
  {
    title: 'Projects that track their own status',
    body: 'Real checklists, phases, and milestones — a project moves to Completed on its own once the work and the money both say it is.',
    icon: <path d="M2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2Zm0 2h12v3H2V2Zm0 5h5v7H2V7Zm7 0h5v7H9V7Z" />,
  },
  {
    title: 'Crew and vendor rosters',
    body: "Plan who's booked and what it will cost against real purchase orders, kept separate from what's actually been billed.",
    icon: <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-3 0-6 1.5-6 3.5V15h12v-2c0-2-3-3.5-6-3.5Z" />,
  },
  {
    title: 'Invoicing that posts to your own books',
    body: 'Every invoice is a real ERPNext Sales Invoice on your own accounts — never a shadow ledger only StudioOS can see.',
    icon: <path d="M3 0h10a1 1 0 0 1 1 1v14l-3-2-3 2-3-2-3 2V1a1 1 0 0 1 1-1Zm2 4v2h6V4H5Zm0 4v2h6V8H5Z" />,
  },
  {
    title: 'Dashboards for what matters',
    body: "Cash flow, payables, and what's actually outstanding — one view instead of piecing it together from four places.",
    icon: <path d="M5.936.278A7.983 7.983 0 0 1 8 0a8 8 0 1 1-8 8c0-.722.104-1.413.278-2.064a1 1 0 1 1 1.932.516A5.99 5.99 0 0 0 2 8a6 6 0 1 0 6-6c-.53 0-1.045.076-1.548.21A1 1 0 1 1 5.936.278Z" />,
  },
  {
    title: 'Your books, always',
    body: 'Nothing StudioOS shows you is something only StudioOS knows — every number lives in your ERPNext, and stays there.',
    icon: <path d="M0 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1V3Zm2 2v2h12V5H2Zm0 4v4h5V9H2Z" />,
  },
];

function Features() {
  return (
    <section id="features" className="px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100 text-center">
          Built for how studios actually work
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700/60 p-5"
            >
              <div
                className="w-9 h-9 flex items-center justify-center rounded-lg
                           bg-violet-500/10 text-violet-500 mb-4"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {f.icon}
                </svg>
              </div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">{f.title}</h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Footer */

/**
 * Every value below is a placeholder. Contact email and social links have
 * not been supplied yet -- swap these before this page goes live. See the
 * implementation plan for the note this was flagged with.
 */
const CONTACT_EMAIL = 'hello@studioos.app';

const SOCIALS: { label: string; href: string; icon: React.ReactNode }[] = [
  {
    label: 'Instagram',
    href: '#',
    icon: (
      <path d="M8 0C5.8 0 5.5 0 4.7.1 3.9.1 3.3.3 2.8.5c-.5.2-1 .5-1.4.9-.4.4-.7.9-.9 1.4C.3 3.3.1 3.9.1 4.7 0 5.5 0 5.8 0 8s0 2.5.1 3.3c.1.8.2 1.4.4 1.9.2.5.5 1 .9 1.4.4.4.9.7 1.4.9.5.2 1.1.4 1.9.4.8.1 1 .1 3.3.1s2.5 0 3.3-.1c.8-.1 1.4-.2 1.9-.4.5-.2 1-.5 1.4-.9.4-.4.7-.9.9-1.4.2-.5.4-1.1.4-1.9.1-.8.1-1 .1-3.3s0-2.5-.1-3.3c-.1-.8-.2-1.4-.4-1.9a3.6 3.6 0 0 0-.9-1.4A3.6 3.6 0 0 0 12.2.5c-.5-.2-1.1-.4-1.9-.4C9.5 0 9.2 0 8 0Zm0 1.4c2.2 0 2.4 0 3.3.1.8 0 1.2.2 1.5.3.4.1.6.3.9.6.3.3.4.5.6.9.1.3.2.7.3 1.5 0 .8.1 1 .1 3.2s0 2.4-.1 3.2c0 .8-.2 1.2-.3 1.5-.1.4-.3.6-.6.9-.3.3-.5.4-.9.6-.3.1-.7.2-1.5.3-.8 0-1 .1-3.3.1s-2.4 0-3.3-.1c-.8 0-1.2-.2-1.5-.3-.4-.1-.6-.3-.9-.6-.3-.3-.4-.5-.6-.9-.1-.3-.2-.7-.3-1.5 0-.8-.1-1-.1-3.2s0-2.4.1-3.2c0-.8.2-1.2.3-1.5.1-.4.3-.6.6-.9.3-.3.5-.4.9-.6.3-.1.7-.2 1.5-.3.9-.1 1.1-.1 3.3-.1ZM8 3.9a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 0 0 0-8.2Zm0 6.8a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Zm5.2-7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
    ),
  },
  {
    label: 'LinkedIn',
    href: '#',
    icon: (
      <path d="M14.8 0H1.2C.5 0 0 .5 0 1.2v13.6c0 .7.5 1.2 1.2 1.2h13.6c.7 0 1.2-.5 1.2-1.2V1.2c0-.7-.5-1.2-1.2-1.2ZM4.7 13.6H2.4V6h2.4v7.6ZM3.6 5C2.8 5 2.2 4.3 2.2 3.6c0-.8.6-1.4 1.4-1.4.8 0 1.4.6 1.4 1.4 0 .7-.6 1.4-1.4 1.4Zm10 8.6h-2.4V9.9c0-.9 0-2-1.2-2s-1.4 1-1.4 2v3.7H6.2V6h2.3v1c.3-.6 1.1-1.2 2.2-1.2 2.4 0 2.8 1.6 2.8 3.6v4.2Z" />
    ),
  },
  {
    label: 'X',
    href: '#',
    icon: (
      <path d="M12.6.7h2.5L9.9 6.9l6 8h-4.7l-3.6-4.8L3.5 15H1L6.7 8.3.9.7h4.8l3.3 4.4L12.6.7Zm-.9 12.6h1.4L4.3 2h-1.5l8.9 11.3Z" />
    ),
  },
  {
    label: 'YouTube',
    href: '#',
    icon: (
      <path d="M15.7 4.2a2 2 0 0 0-1.4-1.4C13 2.4 8 2.4 8 2.4s-5 0-6.3.4A2 2 0 0 0 .3 4.2 21 21 0 0 0 0 8c0 1.3.1 2.5.3 3.8a2 2 0 0 0 1.4 1.4c1.3.4 6.3.4 6.3.4s5 0 6.3-.4a2 2 0 0 0 1.4-1.4c.2-1.3.3-2.5.3-3.8 0-1.3-.1-2.5-.3-3.8ZM6.4 10.5V5.5L10.5 8l-4.1 2.5Z" />
    ),
  },
];

function Footer() {
  return (
    <footer className="px-4 sm:px-6 lg:px-8 py-10 border-t border-gray-200 dark:border-gray-700/60">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          <div className="text-xs font-bold tracking-[0.2em] text-violet-500">STUDIOOS</div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-1 block text-sm text-gray-500 dark:text-gray-400 hover:text-violet-500"
          >
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="flex items-center gap-3">
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              aria-label={s.label}
              className="w-8 h-8 flex items-center justify-center rounded-full
                         bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400
                         hover:text-violet-500 dark:hover:text-violet-400"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 16 16">
                {s.icon}
              </svg>
            </a>
          ))}
        </div>

        <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} StudioOS</p>
      </div>
    </footer>
  );
}
