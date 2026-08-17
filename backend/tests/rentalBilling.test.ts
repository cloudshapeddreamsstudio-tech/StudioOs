import { describe, it, expect } from 'bun:test';
import {
  parseTimeToHours,
  computeDuration,
  computeSessionAmount,
  computeBookingTotals,
  buildRollupDescription,
  monthlyAmount,
  type RentalSessionRow,
} from '../src/lib/rentalBilling';

/**
 * Studio hall billing. These rules decide what a client is actually charged for
 * a workshop session, so the rounding is pinned exactly against the studio's
 * own spreadsheet behaviour.
 */

const session = (over: Partial<RentalSessionRow> = {}): RentalSessionRow => ({
  id: 'sess-1',
  bookingId: 'rental-1',
  date: '2026-05-01',
  timeIn: '6:00 am',
  timeOut: '8:00 am',
  hours: 2,
  roundedHours: 2,
  amount: 100,
  paid: false,
  paymentDate: null,
  invoiceRef: null,
  ...over,
});

describe('parseTimeToHours', () => {
  it('parses am and pm into decimal hours', () => {
    expect(parseTimeToHours('6:30 am')).toBe(6.5);
    expect(parseTimeToHours('1:00 pm')).toBe(13);
    expect(parseTimeToHours('8:04 am')).toBeCloseTo(8 + 4 / 60, 6);
  });

  it('handles the two midnight/noon special cases', () => {
    expect(parseTimeToHours('12:00 am')).toBe(0);
    expect(parseTimeToHours('12:30 pm')).toBe(12.5);
  });

  it('is tolerant of spacing and case', () => {
    expect(parseTimeToHours('6:00AM')).toBe(6);
    expect(parseTimeToHours('  7:15 Pm  ')).toBe(19.25);
  });

  it('returns null rather than guessing at anything unrecognised', () => {
    for (const bad of ['', null, undefined, 'morning', '6:00', '6 am', '6.30 am']) {
      expect(parseTimeToHours(bad as string)).toBeNull();
    }
  });

  it('rejects out-of-range times instead of producing a nonsense bill', () => {
    // The original accepted these: "25:00 am" became hour 25, "6:99 am" became
    // 7.65. Both would have silently produced a wrong duration and a wrong
    // charge, with nothing to indicate anything was off.
    expect(parseTimeToHours('25:00 am')).toBeNull();
    expect(parseTimeToHours('0:30 am')).toBeNull(); // 12-hour format has no 0
    expect(parseTimeToHours('6:99 am')).toBeNull();
    expect(parseTimeToHours('13:00 pm')).toBeNull();
  });
});

describe('computeDuration — what the client is billed for', () => {
  it('rounds to the nearest whole hour', () => {
    // 2h07m bills as 2 — the studio's spreadsheet does the same.
    expect(computeDuration('5:57 am', '8:04 am')).toEqual({ hours: 2.12, roundedHours: 2 });
  });

  it('rounds a half hour up', () => {
    expect(computeDuration('6:00 am', '9:30 am').roundedHours).toBe(4);
  });

  it('never bills less than one hour', () => {
    // A 20-minute session still occupies the hall.
    expect(computeDuration('6:00 am', '6:20 am').roundedHours).toBe(1);
  });

  it('returns zero when the times are invalid or reversed', () => {
    expect(computeDuration('8:00 am', '6:00 am')).toEqual({ hours: 0, roundedHours: 0 });
    expect(computeDuration('8:00 am', '8:00 am')).toEqual({ hours: 0, roundedHours: 0 });
    expect(computeDuration('nonsense', '8:00 am')).toEqual({ hours: 0, roundedHours: 0 });
  });

  it('keeps raw hours separate from billable hours', () => {
    // Both are stored: `hours` is what happened, `roundedHours` is what is
    // charged. Keeping them apart is what makes a disputed bill checkable.
    const d = computeDuration('6:00 am', '8:07 am');
    expect(d.hours).toBeCloseTo(2.12, 2);
    expect(d.roundedHours).toBe(2);
  });
});

describe('computeSessionAmount', () => {
  it('charges hourly bookings by rounded hours', () => {
    expect(computeSessionAmount({ rateType: 'hourly', rate: 50 }, 3)).toBe(150);
  });

  it('charges flat bookings once per session, ignoring hours', () => {
    expect(computeSessionAmount({ rateType: 'flat', rate: 2000 }, 7)).toBe(2000);
  });
});

describe('computeBookingTotals', () => {
  it('keeps paid and billed independent', () => {
    // A session can be paid in cash with no invoice, or invoiced and unpaid.
    // Conflating the two would misreport both money and paperwork.
    const t = computeBookingTotals([
      session({ id: 's1', amount: 100, paid: true, invoiceRef: null }),
      session({ id: 's2', amount: 200, paid: false, invoiceRef: 'SINV-26-00010' }),
    ]);
    expect(t.totalPayable).toBe(300);
    expect(t.totalPaid).toBe(100);
    expect(t.totalPending).toBe(200);
    expect(t.unbilledCount).toBe(1);
    expect(t.unbilledAmount).toBe(100);
  });

  it('sums billable hours, not raw hours', () => {
    const t = computeBookingTotals([
      session({ id: 's1', hours: 2.12, roundedHours: 2 }),
      session({ id: 's2', hours: 3.5, roundedHours: 4 }),
    ]);
    expect(t.totalHours).toBe(6);
  });

  it('handles a booking with no sessions', () => {
    const t = computeBookingTotals([]);
    expect(t).toEqual({
      sessionCount: 0, totalHours: 0, totalPayable: 0, totalPaid: 0,
      totalPending: 0, unbilledCount: 0, unbilledAmount: 0,
    });
  });
});

describe('buildRollupDescription', () => {
  it('describes a date range across many sessions', () => {
    const r = buildRollupDescription(
      { rateType: 'hourly', tag: 'Annual Theatre Workshop' },
      [
        session({ id: 's1', date: '2026-05-01', roundedHours: 2, amount: 100 }),
        session({ id: 's2', date: '2026-05-08', roundedHours: 3, amount: 150 }),
      ],
    );
    expect(r.description).toBe(
      'Studio Hall Usage - Annual Theatre Workshop (5 hrs, 2 sessions, 2026-05-01 to 2026-05-08)',
    );
    expect(r.totalAmount).toBe(250);
    expect(r.totalHours).toBe(5);
  });

  it('uses a single date and singular wording for one session', () => {
    const r = buildRollupDescription({ rateType: 'hourly', tag: 'Workshop' }, [
      session({ date: '2026-05-01', roundedHours: 2, amount: 100 }),
    ]);
    expect(r.description).toBe('Studio Hall Usage - Workshop (2 hrs, 1 session, 2026-05-01)');
  });

  it('omits hours for a flat-rate booking', () => {
    const r = buildRollupDescription({ rateType: 'flat', tag: 'Photo Shoot' }, [
      session({ date: '2026-05-01', amount: 2000 }),
    ]);
    expect(r.description).toBe('Studio Hall Usage - Photo Shoot (1 session, 2026-05-01)');
  });

  it('orders the period by date, not by entry order', () => {
    const r = buildRollupDescription({ rateType: 'flat', tag: 'X' }, [
      session({ id: 's1', date: '2026-06-30' }),
      session({ id: 's2', date: '2026-01-05' }),
    ]);
    expect(r.description).toContain('2026-01-05 to 2026-06-30');
  });
});

describe('monthlyAmount — comparing subscription cycles', () => {
  it('normalises each cycle to a month', () => {
    expect(monthlyAmount({ amount: 1200, cycle: 'Yearly' })).toBe(100);
    expect(monthlyAmount({ amount: 300, cycle: 'Quarterly' })).toBe(100);
    expect(monthlyAmount({ amount: 100, cycle: 'Monthly' })).toBe(100);
    expect(monthlyAmount({ amount: 100, cycle: 'Weekly' })).toBeCloseTo((100 * 52) / 12, 6);
  });

  it('treats an unknown or missing cycle as monthly', () => {
    expect(monthlyAmount({ amount: 250 })).toBe(250);
    expect(monthlyAmount({ amount: 250, cycle: 'Fortnightly' })).toBe(250);
  });

  it('is zero-safe', () => {
    expect(monthlyAmount({})).toBe(0);
    expect(monthlyAmount({ amount: null, cycle: 'Yearly' })).toBe(0);
  });
});
