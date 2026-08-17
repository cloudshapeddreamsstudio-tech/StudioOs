import { Hono } from 'hono';
import { createFrappeClient } from '../lib/frappe';
import type { AppEnv } from '../types';

/**
 * Customers. Read-only list, used to populate the customer picker on the
 * project form. Creating a customer happens implicitly through
 * `resolveCustomer` in routes/projects.ts, exactly as before.
 */

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const frappe = createFrappeClient(c.env);
  const data = await frappe.getList('Customer', {
    fields: ['name', 'customer_name', 'customer_group', 'territory'],
    limit: 500,
    orderBy: 'customer_name asc',
  });
  return c.json(data);
});

export default app;
