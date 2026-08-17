/**
 * Studio hall rental billing.
 *
 * The studio rents its hall out for things that aren't video production —
 * theatre workshops, photography, events. This is usage-based billing, not an
 * ERPNext Project: a *booking* is one ongoing arrangement with a client, and
 * each booking accumulates *sessions* (date + in/out times). Sessions are later
 * rolled up into a real ERPNext Sales Invoice.
 *
 * Extracted from `server/routes/studioRental.js` so the arithmetic can be
 * tested. Rounding rules here decide what a client is actually charged, so they
 * are worth pinning precisely.
 */

export interface RentalBookingRow {
  id: string;
  client: string;
  poc: string;
  tag: string;
  rateType: string;
  rate: number;
  billingCycle: string;
  notes: string;
}

export interface RentalSessionRow {
  id: string;
  bookingId: string;
  date: string;
  timeIn: string;
  timeOut: string;
  hours: number;
  roundedHours: number;
  amount: number;
  paid: boolean;
  paymentDate: string | null;
  /** Set once the session has been rolled into a Sales Invoice. */
  invoiceRef: string | null;
}

/**
 * Parses "6:30 am" / "1:00 pm" into decimal hours since midnight (6.5, 13.0),
 * so a duration can be computed regardless of how the times were typed.
 * Returns null on anything it doesn't recognise — never a guess.
 */
export function parseTimeToHours(str: string | null | undefined): number | null {
  const m = String(str ?? '').trim().match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (!m || !m[1] || !m[2] || !m[3]) return null;

  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toLowerCase();

  /**
   * Range check the original did not have. Its regex accepted any one- or
   * two-digit hour, so "25:00 am" parsed as hour 25 and "6:99 am" as 7.65 —
   * both producing a nonsense duration and therefore a nonsense bill, silently.
   * In 12-hour format only 1–12 and 0–59 are meaningful; anything else is
   * rejected rather than guessed at.
   */
  if (h < 1 || h > 12 || min > 59) return null;

  if (period === 'pm' && h !== 12) h += 12;
  if (period === 'am' && h === 12) h = 0;

  return h + min / 60;
}

/**
 * Duration in hours. Sessions never span midnight in this business.
 *
 * Billable hours round to the nearest whole hour, with a floor of 1 — matching
 * the studio's own spreadsheet exactly: 2h07m bills as 2, 3h30m bills as 4, and
 * a 20-minute session still bills as 1.
 */
export function computeDuration(
  timeIn: string | null | undefined,
  timeOut: string | null | undefined,
): { hours: number; roundedHours: number } {
  const start = parseTimeToHours(timeIn);
  const end = parseTimeToHours(timeOut);

  if (start === null || end === null || end <= start) return { hours: 0, roundedHours: 0 };

  const hours = Math.round((end - start) * 100) / 100;
  return { hours, roundedHours: Math.max(1, Math.round(hours)) };
}

/** Hourly bookings charge by rounded hours; flat bookings charge per session. */
export function computeSessionAmount(
  booking: Pick<RentalBookingRow, 'rateType' | 'rate'>,
  roundedHours: number,
): number {
  return booking.rateType === 'hourly'
    ? roundedHours * Number(booking.rate || 0)
    : Number(booking.rate || 0);
}

export interface BookingTotals {
  sessionCount: number;
  totalHours: number;
  totalPayable: number;
  totalPaid: number;
  totalPending: number;
  unbilledCount: number;
  unbilledAmount: number;
}

/**
 * Booking totals.
 *
 * Note "paid" and "billed" are independent, and deliberately so: a session can
 * be paid in cash before any invoice exists, and a session can be invoiced
 * without having been paid. `totalPending` tracks money; `unbilledAmount`
 * tracks paperwork. Conflating them would misreport both.
 */
export function computeBookingTotals(sessions: RentalSessionRow[]): BookingTotals {
  const totalPayable = sessions.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalPaid = sessions
    .filter((x) => x.paid)
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const unbilled = sessions.filter((x) => !x.invoiceRef);

  return {
    sessionCount: sessions.length,
    totalHours: sessions.reduce((s, x) => s + Number(x.roundedHours || 0), 0),
    totalPayable,
    totalPaid,
    totalPending: totalPayable - totalPaid,
    unbilledCount: unbilled.length,
    unbilledAmount: unbilled.reduce((s, x) => s + Number(x.amount || 0), 0),
  };
}

/**
 * The single invoice line describing a roll-up.
 *
 * Every unbilled session becomes ONE line, not one line per session — a
 * half-year of a weekly workshop would otherwise produce dozens of lines for
 * what the client thinks of as one charge.
 */
export function buildRollupDescription(
  booking: Pick<RentalBookingRow, 'rateType' | 'tag'>,
  unbilled: RentalSessionRow[],
): { description: string; totalAmount: number; totalHours: number } {
  const totalAmount = unbilled.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalHours = unbilled.reduce((s, x) => s + Number(x.roundedHours || 0), 0);

  const dates = unbilled.map((s) => s.date).sort();
  const periodLabel =
    dates.length > 1 ? `${dates[0]} to ${dates[dates.length - 1]}` : (dates[0] ?? '');
  const plural = unbilled.length > 1 ? 's' : '';

  const description =
    booking.rateType === 'hourly'
      ? `Studio Hall Usage - ${booking.tag} (${totalHours} hrs, ${unbilled.length} session${plural}, ${periodLabel})`
      : `Studio Hall Usage - ${booking.tag} (${unbilled.length} session${plural}, ${periodLabel})`;

  return { description, totalAmount, totalHours };
}

/**
 * Normalises any billing cycle to a per-month figure so subscription totals are
 * comparable. From `server/routes/subscriptions.js`.
 */
export function monthlyAmount(sub: { amount?: number | null; cycle?: string | null }): number {
  const amt = Number(sub.amount || 0);
  switch (sub.cycle) {
    case 'Weekly':
      return (amt * 52) / 12;
    case 'Yearly':
      return amt / 12;
    case 'Quarterly':
      return amt / 3;
    default:
      return amt; // Monthly
  }
}
