import { Hono } from 'hono';
import { eq, isNull, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { rentalBookings, rentalSessions } from '../db/schema';
import { computeInvoiceNumber } from '../lib/invoiceNumber';
import {
  computeDuration,
  computeSessionAmount,
  computeBookingTotals,
  buildRollupDescription,
  type RentalSessionRow,
} from '../lib/rentalBilling';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { AppEnv, Env } from '../types';

/**
 * Studio Space Rental — the hall itself let out for things that aren't video
 * production: theatre workshops, photography, events.
 *
 * Deliberately NOT an ERPNext Project. This is usage-based hall billing. A
 * *booking* is one ongoing arrangement with a client; each booking accumulates
 * *sessions*, and sessions roll up into a real ERPNext Sales Invoice.
 *
 * Ported from `server/routes/studioRental.js`. The one structural change: the
 * JSON nested sessions inside their booking, while D1 stores them as a child
 * table — so reads join, rather than reading one blob.
 */

const INCOME_ACCOUNT = 'Sales - CSDS';
const DEBIT_TO = 'Debtors - CSDS';
const COST_CENTER = 'Main - CSDS';

const app = new Hono<AppEnv>();

const bookingSchema = z.object({
  client: z.string().min(1, 'client is required'),
  tag: z.string().min(1, 'tag is required'),
  poc: z.string().optional(),
  rateType: z.string().optional(),
  rate: z.coerce.number().optional(),
  billingCycle: z.string().optional(),
  notes: z.string().optional(),
});

const sessionSchema = z.object({
  date: z.string().min(1, 'date is required'),
  timeIn: z.string().min(1, 'timeIn is required'),
  timeOut: z.string().min(1, 'timeOut is required'),
  paid: z.boolean().optional(),
  paymentDate: z.string().nullable().optional(),
});

type BookingRow = typeof rentalBookings.$inferSelect;

/** Attaches a booking's sessions and computed totals — the shape the old API
 *  returned, rebuilt from two tables. */
async function withSessions(env: Env, booking: BookingRow) {
  const sessions = await db(env)
    .select()
    .from(rentalSessions)
    .where(eq(rentalSessions.bookingId, booking.id));

  return { ...booking, sessions, totals: computeBookingTotals(sessions as RentalSessionRow[]) };
}

async function getBookingOr404(env: Env, id: string): Promise<BookingRow> {
  const rows = await db(env).select().from(rentalBookings).where(eq(rentalBookings.id, id));
  const booking = rows[0];
  if (!booking) throw new NotFoundError('Booking');
  return booking;
}

/** GET /api/studio-rental/bookings — all bookings with their sessions and totals. */
app.get('/bookings', async (c) => {
  const conn = db(c.env);
  const bookings = await conn.select().from(rentalBookings);
  if (!bookings.length) return c.json([]);

  /**
   * One query for every session across all bookings, then grouped in memory —
   * rather than one query per booking. With 103 sessions this is the difference
   * between 1 database round trip and N+1.
   */
  const ids = bookings.map((b) => b.id);
  const allSessions = await conn
    .select()
    .from(rentalSessions)
    .where(inArray(rentalSessions.bookingId, ids));

  const byBooking: Record<string, RentalSessionRow[]> = {};
  for (const s of allSessions) (byBooking[s.bookingId] ||= []).push(s as RentalSessionRow);

  return c.json(
    bookings.map((b) => {
      const sessions = byBooking[b.id] ?? [];
      return { ...b, sessions, totals: computeBookingTotals(sessions) };
    }),
  );
});

/** POST /api/studio-rental/bookings — start a new rental arrangement. */
app.post('/bookings', async (c) => {
  const b = bookingSchema.parse(await c.req.json());

  const booking = {
    id: `rental-${Date.now()}`,
    client: b.client,
    poc: b.poc ?? '',
    tag: b.tag,
    // Anything that isn't explicitly "flat" is hourly — the billing maths
    // depends on this being exact.
    rateType: b.rateType === 'flat' ? 'flat' : 'hourly',
    rate: Number(b.rate) || 0,
    billingCycle: b.billingCycle ?? '',
    notes: b.notes ?? '',
    createdAt: new Date().toISOString().slice(0, 10),
  };

  await db(c.env).insert(rentalBookings).values(booking);
  return c.json({ ...booking, sessions: [], totals: computeBookingTotals([]) });
});

/** PUT /api/studio-rental/bookings/:id */
app.put('/bookings/:id', async (c) => {
  const id = c.req.param('id');
  await getBookingOr404(c.env, id);
  const b = bookingSchema.partial().parse(await c.req.json());

  const patch: Record<string, unknown> = {};
  if (b.client !== undefined) patch.client = b.client;
  if (b.poc !== undefined) patch.poc = b.poc;
  if (b.tag !== undefined) patch.tag = b.tag;
  if (b.rateType !== undefined) patch.rateType = b.rateType === 'flat' ? 'flat' : 'hourly';
  if (b.rate !== undefined) patch.rate = Number(b.rate) || 0;
  if (b.billingCycle !== undefined) patch.billingCycle = b.billingCycle;
  if (b.notes !== undefined) patch.notes = b.notes;

  if (Object.keys(patch).length) {
    await db(c.env).update(rentalBookings).set(patch).where(eq(rentalBookings.id, id));
  }

  /**
   * Note the rate change does NOT retroactively reprice existing sessions.
   * That matches the original, and it is the right behaviour: a session was
   * billed at the rate agreed on the day, and silently rewriting history would
   * change what a client already owes.
   */
  return c.json(await withSessions(c.env, await getBookingOr404(c.env, id)));
});

/** DELETE /api/studio-rental/bookings/:id — sessions cascade. */
app.delete('/bookings/:id', async (c) => {
  const deleted = await db(c.env)
    .delete(rentalBookings)
    .where(eq(rentalBookings.id, c.req.param('id')))
    .returning({ id: rentalBookings.id });

  if (!deleted.length) throw new NotFoundError('Booking');
  return c.json({ deleted: true });
});

/**
 * POST /api/studio-rental/bookings/:id/sessions — log a session.
 * Duration and amount are computed server-side from the booking's rate; the
 * client never supplies an amount.
 */
app.post('/bookings/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const booking = await getBookingOr404(c.env, id);
  const b = sessionSchema.parse(await c.req.json());

  const { hours, roundedHours } = computeDuration(b.timeIn, b.timeOut);
  if (roundedHours <= 0) {
    throw new ValidationError('timeOut must be after timeIn, and both must be valid times');
  }

  const session = {
    id: `sess-${Date.now()}`,
    bookingId: id,
    date: b.date,
    timeIn: b.timeIn,
    timeOut: b.timeOut,
    hours,
    roundedHours,
    amount: computeSessionAmount(booking, roundedHours),
    paid: Boolean(b.paid),
    paymentDate: b.paymentDate ?? null,
    invoiceRef: null,
  };

  await db(c.env).insert(rentalSessions).values(session);
  return c.json(await withSessions(c.env, booking));
});

/** PUT /api/studio-rental/bookings/:id/sessions/:sessionId */
app.put('/bookings/:id/sessions/:sessionId', async (c) => {
  const id = c.req.param('id');
  const sessionId = c.req.param('sessionId');
  const booking = await getBookingOr404(c.env, id);
  const conn = db(c.env);

  const existing = (
    await conn.select().from(rentalSessions).where(eq(rentalSessions.id, sessionId))
  )[0];
  if (!existing || existing.bookingId !== id) throw new NotFoundError('Session');

  const b = sessionSchema.partial().parse(await c.req.json());
  const patch: Record<string, unknown> = {};

  if (b.date !== undefined) patch.date = b.date;
  if (b.timeIn !== undefined) patch.timeIn = b.timeIn;
  if (b.timeOut !== undefined) patch.timeOut = b.timeOut;

  // Any change to the times re-derives hours and amount from the booking rate.
  if (b.timeIn !== undefined || b.timeOut !== undefined) {
    const timeIn = b.timeIn ?? existing.timeIn;
    const timeOut = b.timeOut ?? existing.timeOut;
    const { hours, roundedHours } = computeDuration(timeIn, timeOut);
    if (roundedHours <= 0) {
      throw new ValidationError('timeOut must be after timeIn, and both must be valid times');
    }
    patch.hours = hours;
    patch.roundedHours = roundedHours;
    patch.amount = computeSessionAmount(booking, roundedHours);
  }

  if (b.paid !== undefined) patch.paid = Boolean(b.paid);
  if (b.paymentDate !== undefined) patch.paymentDate = b.paymentDate || null;

  if (Object.keys(patch).length) {
    await conn.update(rentalSessions).set(patch).where(eq(rentalSessions.id, sessionId));
  }

  return c.json(await withSessions(c.env, booking));
});

/** DELETE /api/studio-rental/bookings/:id/sessions/:sessionId */
app.delete('/bookings/:id/sessions/:sessionId', async (c) => {
  const deleted = await db(c.env)
    .delete(rentalSessions)
    .where(eq(rentalSessions.id, c.req.param('sessionId')))
    .returning({ id: rentalSessions.id });

  if (!deleted.length) throw new NotFoundError('Session');
  return c.json(await withSessions(c.env, await getBookingOr404(c.env, c.req.param('id'))));
});

/**
 * POST /api/studio-rental/bookings/:id/invoice — roll every unbilled session
 * into ONE draft Sales Invoice line.
 *
 * One line, not one per session: half a year of a weekly workshop would
 * otherwise produce dozens of lines for what the client thinks of as a single
 * charge. Each rolled-up session is stamped with the invoice name so it can
 * never be billed twice.
 *
 * Draft only, like every other invoice this app creates — nothing reaches the
 * ledger without a separate, deliberate submit.
 */
app.post('/bookings/:id/invoice', async (c) => {
  const id = c.req.param('id');
  const booking = await getBookingOr404(c.env, id);
  const conn = db(c.env);
  const frappe = c.get('frappe');

  const unbilled = (await conn
    .select()
    .from(rentalSessions)
    .where(eq(rentalSessions.bookingId, id))
    .then((rows) => rows.filter((s) => !s.invoiceRef))) as RentalSessionRow[];

  if (!unbilled.length) throw new ValidationError('nothing unbilled on this booking');

  const { description, totalAmount } = buildRollupDescription(booking, unbilled);
  const postingDate = new Date().toISOString().slice(0, 10);
  const invoiceNumber = await computeInvoiceNumber(frappe, postingDate);

  const invoice = await frappe.createDoc<{ name: string }>('Sales Invoice', {
    docstatus: 0,
    naming_series: 'SINV-.YY.-',
    company: c.env.COMPANY,
    customer: booking.client,
    posting_date: postingDate,
    currency: 'INR',
    selling_price_list: 'Standard Selling',
    debit_to: DEBIT_TO,
    cost_center: COST_CENTER,
    remarks: `Studio Space Rental - ${booking.tag}`,
    custom_invoice_number: invoiceNumber,
    items: [
      {
        item_name: description,
        description,
        qty: 1,
        rate: totalAmount,
        uom: 'Nos',
        conversion_factor: 1,
        income_account: INCOME_ACCOUNT,
        cost_center: COST_CENTER,
      },
    ],
  });

  /**
   * Stamp the sessions only AFTER the invoice exists. If the ERPNext call
   * throws, nothing has been marked billed and the roll-up can simply be
   * retried — the failure mode is a retry, never a silently unbillable session.
   */
  await conn
    .update(rentalSessions)
    .set({ invoiceRef: invoice.name })
    .where(
      inArray(
        rentalSessions.id,
        unbilled.map((s) => s.id),
      ),
    );

  return c.json({ invoice, booking: await withSessions(c.env, booking) });
});

/** GET /api/studio-rental/unbilled — every session not yet rolled into an
 *  invoice, across all bookings. Drives the "ready to bill" view. */
app.get('/unbilled', async (c) => {
  const rows = await db(c.env)
    .select()
    .from(rentalSessions)
    .where(isNull(rentalSessions.invoiceRef));
  return c.json(rows);
});

export default app;
