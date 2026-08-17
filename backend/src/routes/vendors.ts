import { Hono } from 'hono';
import { createFrappeClient } from '../lib/frappe';
import type { AppEnv } from '../types';

/**
 * Suppliers — the studio's crew, freelancers, and rental houses. Ported from
 * `server/routes/vendors.js` unchanged.
 */

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const frappe = createFrappeClient(c.env);
  const data = await frappe.getList('Supplier', {
    fields: [
      'name',
      'supplier_name',
      'supplier_group',
      'supplier_type',
      'email_id',
      'mobile_no',
      'country',
      'disabled',
    ],
    limit: 200,
    orderBy: 'supplier_name asc',
  });
  return c.json(data);
});

app.get('/:name', async (c) => {
  const frappe = createFrappeClient(c.env);
  return c.json(await frappe.getDoc('Supplier', c.req.param('name')));
});

export default app;
