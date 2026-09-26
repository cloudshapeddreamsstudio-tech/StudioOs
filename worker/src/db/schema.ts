import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * The six local ledgers, lifted from the old `server/data/*.json` files.
 *
 * These hold the data ERPNext does NOT have: studio rental sessions, ad-hoc
 * transactions, per-project crew rosters and out-of-pocket expenses,
 * subscriptions, and invoice branding. Everything else (projects, invoices,
 * customers, tasks, suppliers) still lives in ERPNext and is never duplicated
 * here.
 *
 * Shapes are deliberately unchanged from the JSON. This is a lift-and-shift:
 * redesigning the data model during a stack migration is how migrations die.
 * The one structural change is that `studioRental`'s nested `sessions` array
 * becomes a proper child table, because SQLite has no nested arrays.
 */

/** was: projectExpenses.json -> { expenses: [...] } */
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  project: text('project').notNull(),
  date: text('date').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull().default(''),
  amount: real('amount').notNull().default(0),
  /**
   * Optional planned/estimated amount, driving the Expense Overview table's
   * Planned column. Absent/0 on entries created before this field existed;
   * never back-filled from `amount` -- plan and actual are independently
   * sourced, per the studio's "never guess money" rule.
   */
  estimatedAmount: real('estimated_amount').notNull().default(0),
  paidBy: text('paid_by').notNull().default(''),
  mode: text('mode').notNull().default('Cash'),
  createdAt: text('created_at').notNull(),
});

/** was: projectCrew.json -> { entries: [...] } */
export const crewEntries = sqliteTable('crew_entries', {
  id: text('id').primaryKey(),
  project: text('project').notNull(),
  role: text('role').notNull().default('Crew'),
  name: text('name').notNull(),
  designation: text('designation').notNull().default(''),
  rate: real('rate').notNull().default(0),
  days: real('days').notNull().default(0),
  total: real('total').notNull().default(0),
  contact: text('contact').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

/** was: subscriptions.json -> { subscriptions: [...] } */
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  vendor: text('vendor').notNull().default(''),
  amount: real('amount').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  cycle: text('cycle').notNull().default('Monthly'),
  nextDue: text('next_due').notNull().default(''),
  paymentMode: text('payment_mode').notNull().default(''),
  billedTo: text('billed_to').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull(),
});

/**
 * was: transactions.json -> { nextId: n, transactions: [...] }
 *
 * The JSON kept its own `nextId` counter because a flat file has no sequence.
 * SQLite has one, so the counter is dropped and the PK autoincrements --
 * existing integer ids are preserved on import.
 */
export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  project: text('project'),
  date: text('date').notNull(),
  amount: real('amount').notNull().default(0),
  /** 'income' | 'expense' */
  direction: text('direction').notNull(),
  type: text('type').notNull().default(''),
  description: text('description').notNull().default(''),
  mode: text('mode').notNull().default(''),
  /** e.g. 'bank-import', 'manual' -- provenance, used for reconciliation. */
  source: text('source').notNull().default('manual'),
});

/** was: studioRental.json -> { bookings: [ { ..., sessions: [...] } ] } */
export const rentalBookings = sqliteTable('rental_bookings', {
  id: text('id').primaryKey(),
  client: text('client').notNull(),
  poc: text('poc').notNull().default(''),
  tag: text('tag').notNull().default(''),
  /** 'hourly' | 'daily' | 'flat' */
  rateType: text('rate_type').notNull().default('hourly'),
  rate: real('rate').notNull().default(0),
  billingCycle: text('billing_cycle').notNull().default(''),
  notes: text('notes').notNull().default(''),
  /** Nullable: the two historical bookings predate this field, and inventing a
   *  creation date for them would be making data up. */
  createdAt: text('created_at'),
});

/** The nested `sessions` array, promoted to its own table. */
export const rentalSessions = sqliteTable('rental_sessions', {
  id: text('id').primaryKey(),
  bookingId: text('booking_id')
    .notNull()
    .references(() => rentalBookings.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  timeIn: text('time_in').notNull().default(''),
  timeOut: text('time_out').notNull().default(''),
  hours: real('hours').notNull().default(0),
  roundedHours: real('rounded_hours').notNull().default(0),
  amount: real('amount').notNull().default(0),
  paid: integer('paid', { mode: 'boolean' }).notNull().default(false),
  paymentDate: text('payment_date'),
  /** Set once this session has been rolled into an ERPNext Sales Invoice. */
  invoiceRef: text('invoice_ref'),
});

/**
 * was: brand.json -- a single settings object, not a list.
 *
 * Kept as a one-row table (id is always 1) rather than a key/value store, so
 * the columns stay typed and self-documenting. The old file's nested
 * `address` and `bank` objects are flattened into prefixed columns.
 */
export const brand = sqliteTable('brand', {
  id: integer('id').primaryKey(),
  companyName: text('company_name').notNull().default(''),
  tagline: text('tagline').notNull().default(''),
  logoPath: text('logo_path').notNull().default(''),
  accentColor: text('accent_color').notNull().default('#3d7fa6'),

  addressLine1: text('address_line1').notNull().default(''),
  addressLine2: text('address_line2').notNull().default(''),
  addressLine3: text('address_line3').notNull().default(''),
  addressCountry: text('address_country').notNull().default(''),

  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),

  bankAccountName: text('bank_account_name').notNull().default(''),
  bankName: text('bank_name').notNull().default(''),
  bankAccountNo: text('bank_account_no').notNull().default(''),
  bankBranch: text('bank_branch').notNull().default(''),
  bankIfsc: text('bank_ifsc').notNull().default(''),
  bankPan: text('bank_pan').notNull().default(''),

  upiId: text('upi_id').notNull().default(''),
  showQr: integer('show_qr', { mode: 'boolean' }).notNull().default(true),
  showBankDetails: integer('show_bank_details', { mode: 'boolean' }).notNull().default(true),

  notesTitle: text('notes_title').notNull().default('Notes'),
  notes: text('notes').notNull().default(''),
  footerText: text('footer_text').notNull().default(''),
});

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type CrewEntry = typeof crewEntries.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type RentalBooking = typeof rentalBookings.$inferSelect;
export type RentalSession = typeof rentalSessions.$inferSelect;
export type Brand = typeof brand.$inferSelect;
