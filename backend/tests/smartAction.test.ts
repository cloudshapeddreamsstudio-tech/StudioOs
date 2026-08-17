import { describe, it, expect } from 'bun:test';
import { computeSmartAction, stageFromPhase } from '../src/lib/smartAction';

/**
 * These tests pin the ported behaviour against the original
 * `server/lib/smartAction.js`. They exist so the port can be proven identical
 * rather than assumed identical -- this logic drives the primary call-to-action
 * on every project row, and a silent change here is a change the studio owner
 * would act on.
 */

describe('stageFromPhase', () => {
  it('matches "pre" before "production" (ordering matters)', () => {
    // "pre-production" contains "production" -- the pre test must run first.
    expect(stageFromPhase('AF - Pre-Production')).toBe('pre');
  });

  it('classifies production phases', () => {
    expect(stageFromPhase('Shoot Day 1')).toBe('production');
    expect(stageFromPhase('Production')).toBe('production');
  });

  it('classifies post phases', () => {
    expect(stageFromPhase('Post-Production')).toBe('post');
    expect(stageFromPhase('Colour Grade')).toBe('post');
    expect(stageFromPhase('Delivery')).toBe('post');
  });

  it('treats invoice/billing phases as post', () => {
    expect(stageFromPhase('Invoice & Payment')).toBe('post');
  });

  it('returns null for nothing recognisable', () => {
    expect(stageFromPhase(null)).toBeNull();
    expect(stageFromPhase('')).toBeNull();
    expect(stageFromPhase('Miscellaneous')).toBeNull();
  });
});

describe('computeSmartAction', () => {
  it('cancelled projects can only be reopened', () => {
    const action = computeSmartAction(
      { status: 'Cancelled', total_billed_amount: 50000 },
      { progress: 100, salesOutstanding: 50000, hasDraft: true },
    );
    expect(action).toEqual({ label: 'Reopen', kind: 'reopen', tab: '' });
  });

  it('a draft invoice outranks everything except cancellation', () => {
    const action = computeSmartAction(
      { status: 'Open', total_billed_amount: 0 },
      { hasDraft: true, progress: 10 },
    );
    expect(action.label).toBe('Submit Invoice');
  });

  it('billed with money outstanding chases the payment', () => {
    const action = computeSmartAction(
      { status: 'Open', total_billed_amount: 110000 },
      { salesOutstanding: 55000 },
    );
    expect(action).toEqual({ label: 'Payment Pending', kind: 'payment', tab: 'money' });
  });

  it('billed and fully collected moves to portfolio', () => {
    const action = computeSmartAction(
      { status: 'Open', total_billed_amount: 110000 },
      { salesOutstanding: 0 },
    );
    expect(action).toEqual({ label: 'Add to Portfolio', kind: 'portfolio', tab: 'docs' });
  });

  it('uses the checklist phase when nothing is invoiced yet', () => {
    expect(
      computeSmartAction({ status: 'Open' }, { phase: 'Pre-Production', actionableCount: 5 }).label,
    ).toBe('Plan Equipment');

    expect(computeSmartAction({ status: 'Open' }, { phase: 'Shoot Day 2' }).label).toBe('Add Update');

    expect(computeSmartAction({ status: 'Open' }, { phase: 'Post-Production' }).label).toBe(
      'Create Invoice',
    );
  });

  it('falls back to progress thresholds without a phase', () => {
    expect(computeSmartAction({ status: 'Open' }, { progress: 70 }).label).toBe('Create Invoice');
    expect(computeSmartAction({ status: 'Open' }, { progress: 40 }).label).toBe('Add Update');
    expect(
      computeSmartAction({ status: 'Open' }, { progress: 10, actionableCount: 3 }).label,
    ).toBe('Plan Equipment');
  });

  it('a project with no checklist at all defaults to invoicing', () => {
    // The studio's historical projects have no tasks; the useful next money
    // step for them is to raise the invoice.
    expect(computeSmartAction({ status: 'Open' }, {}).label).toBe('Create Invoice');
  });

  it('completed projects with nothing billed go straight to invoicing', () => {
    expect(computeSmartAction({ status: 'Completed' }, { progress: 100 }).label).toBe(
      'Create Invoice',
    );
  });
});
