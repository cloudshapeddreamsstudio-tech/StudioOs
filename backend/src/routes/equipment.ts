import { Hono } from 'hono';
import type { AppEnv } from '../types';

/**
 * Rental equipment — the Item doctype filtered to Equipment groups.
 *
 * Ported from `server/routes/equipment.js`. Note the old file's comment said
 * this "will return an empty array until the equipment Items are created"; they
 * now exist (the catalogue is 269 items, mostly a rental house list), so this
 * returns real rows.
 */

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const frappe = c.get('frappe');
  const data = await frappe.getList('Item', {
    fields: [
      'item_code',
      'item_name',
      'item_group',
      'stock_uom',
      'standard_rate',
      'description',
      'disabled',
    ],
    filters: [
      ['item_group', 'like', '%Equipment%'],
      ['disabled', '=', 0],
    ],
    limit: 200,
    orderBy: 'item_name asc',
  });
  return c.json(data);
});

app.get('/:item_code', async (c) => {
  const frappe = c.get('frappe');
  return c.json(await frappe.getDoc('Item', c.req.param('item_code')));
});

export default app;
