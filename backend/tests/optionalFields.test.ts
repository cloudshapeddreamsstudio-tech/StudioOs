import { describe, it, expect } from 'bun:test';
import {
  getListTolerant,
  missingFieldFrom,
  SchemaGapError,
} from '../src/lib/optionalFields';
import { FrappeError } from '../src/lib/errors';
import type { ListOptions } from '../src/lib/frappe';

/**
 * These pin the behaviour that lets one build serve studios whose ERPNext
 * schemas differ. The case that matters most is the last one: a missing field
 * used as a *filter* must refuse rather than widen the result, because a
 * widened result is a wrong number stated confidently.
 */

/** The body Frappe actually returned from the bench, trimmed. */
function fieldNotPermitted(field: string): FrappeError {
  return new FrappeError(417, {
    exception: `frappe.exceptions.DataError: Field not permitted in query: ${field}`,
    exc_type: 'DataError',
  });
}

/** A getList that rejects the named fields the way ERPNext does, one per call. */
function fakeFrappe(absent: string[], rows: Record<string, unknown>[] = [{ name: 'ITEM-1' }]) {
  const calls: string[][] = [];
  return {
    calls,
    getList: async <T>(_doctype: string, opts: ListOptions = {}) => {
      const fields = opts.fields ?? [];
      calls.push([...fields]);
      const offender =
        fields.find((f) => absent.includes(f)) ??
        (opts.filters ?? []).map((f) => f[0]).find((f) => absent.includes(String(f)));
      if (offender) throw fieldNotPermitted(String(offender));
      return rows as T[];
    },
  };
}

describe('missingFieldFrom', () => {
  it('reads the field name out of a Frappe DataError', () => {
    expect(missingFieldFrom(fieldNotPermitted('equipment_status'))).toBe('equipment_status');
  });

  it('returns null for an unrelated error, so real faults are not swallowed', () => {
    expect(missingFieldFrom(new FrappeError(403, { exception: 'PermissionError: no' }))).toBeNull();
    expect(missingFieldFrom(new Error('network down'))).toBeNull();
  });
});

describe('getListTolerant', () => {
  it('drops a field this site does not have and reports it', async () => {
    const frappe = fakeFrappe(['equipment_status']);

    const { rows, missingFields } = await getListTolerant(frappe, 'Item', {
      fields: ['item_code', 'item_name', 'equipment_status'],
      filters: [['item_group', '=', 'In-House Equipment']],
    });

    expect(rows).toHaveLength(1);
    expect(missingFields).toEqual(['equipment_status']);
    expect(frappe.calls[1]).toEqual(['item_code', 'item_name']);
  });

  it('drops several, one round each', async () => {
    const frappe = fakeFrappe(['equipment_status', 'rental_source']);

    const { missingFields } = await getListTolerant(frappe, 'Item', {
      fields: ['item_code', 'equipment_status', 'rental_source'],
    });

    expect(missingFields.sort()).toEqual(['equipment_status', 'rental_source']);
  });

  it('returns an empty missingFields list when the site has everything', async () => {
    const frappe = fakeFrappe([]);
    const { missingFields } = await getListTolerant(frappe, 'Item', { fields: ['item_code'] });
    expect(missingFields).toEqual([]);
    expect(frappe.calls).toHaveLength(1);
  });

  /**
   * The one that must never regress, for two reasons. Dropping the filter
   * would return every in-house item and the insight card would announce all
   * of it as out of service. Keeping it without the typed refusal is no better:
   * ERPNext rejects the query again for the filter and the raw 417 escapes,
   * which is what took the whole insights endpoint down over one absent column.
   */
  it('refuses rather than widening when the missing field is a filter', async () => {
    const frappe = fakeFrappe(['equipment_status']);

    const attempt = getListTolerant(frappe, 'Item', {
      fields: ['item_code', 'equipment_status'],
      filters: [
        ['item_group', '=', 'In-House Equipment'],
        ['equipment_status', 'in', ['In Repair', 'In Maintenance']],
      ],
    });

    await expect(attempt).rejects.toThrow(SchemaGapError);
    await expect(attempt).rejects.toThrow('Item on this site has no field "equipment_status"');
  });

  it('rethrows a permission error untouched', async () => {
    const frappe = {
      getList: async () => {
        throw new FrappeError(403, { exception: 'frappe.exceptions.PermissionError: nope' });
      },
    };

    await expect(getListTolerant(frappe, 'Item', { fields: ['item_code'] })).rejects.toThrow(
      'ERPNext API error 403',
    );
  });

  it('rethrows when ERPNext names a field that was never requested', async () => {
    const frappe = {
      getList: async () => {
        throw fieldNotPermitted('something_we_did_not_ask_for');
      },
    };

    await expect(getListTolerant(frappe, 'Item', { fields: ['item_code'] })).rejects.toThrow(
      'ERPNext API error 417',
    );
  });
});
