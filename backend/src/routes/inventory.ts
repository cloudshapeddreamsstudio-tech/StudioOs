import { Hono } from 'hono';
import { createFrappeClient } from '../lib/frappe';
import type { AppEnv } from '../types';

/**
 * Gear inventory. Ported from `server/routes/inventory.js`.
 *
 * Two Item Groups hold actual gear:
 *  - **In-House Equipment** — gear the studio owns and rents out itself,
 *    tracked via the `equipment_status` custom field (Available / Rented Out /
 *    In Repair / In Maintenance) so a project can be planned against what is
 *    genuinely free.
 *  - **Rental House Catalogue** — gear specific external vendors offer. Each
 *    item's `rental_source` (Link → Supplier) says which rental house it comes
 *    from, and `standard_rate` is their price to us.
 *
 * Everything else in Item (the service catalogue used on invoices, stray
 * Products-group rows) is excluded. This endpoint is gear only.
 */

const GEAR_ITEM_GROUPS = ['In-House Equipment', 'Rental House Catalogue'];

const app = new Hono<AppEnv>();

/**
 * GET /api/inventory/files/:file_id/download — proxy a (possibly private)
 * attached file so the browser can view it without ERPNext credentials.
 *
 * Declared before /:item_code so the parameter route doesn't swallow it.
 */
app.get('/files/:file_id/download', async (c) => {
  const frappe = createFrappeClient(c.env);
  const fileDoc = await frappe.getDoc<{ file_url: string; file_name: string }>(
    'File',
    c.req.param('file_id'),
  );
  const { buffer, contentType } = await frappe.downloadFile(fileDoc.file_url);

  return c.body(buffer, 200, {
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${fileDoc.file_name}"`,
  });
});

/** GET /api/inventory — gear, both in-house and rental-house catalogue. */
app.get('/', async (c) => {
  const frappe = createFrappeClient(c.env);

  const items = await frappe.getList<{ item_code: string }>('Item', {
    fields: [
      'item_code',
      'item_name',
      'item_group',
      'stock_uom',
      'standard_rate',
      'description',
      'disabled',
      'equipment_status',
      'rental_source',
    ],
    filters: [
      ['disabled', '=', 0],
      ['item_group', 'in', GEAR_ITEM_GROUPS],
    ],
    limit: 500,
    orderBy: 'item_name asc',
  });

  /**
   * Bills, warranties and service docs attached to these Items via ERPNext's
   * standard file-attach mechanism, so the page can show what documentation
   * exists per piece of gear.
   *
   * Deliberately NOT filtered by `attached_to_name`: with ~200 gear items the
   * resulting URL blows past Frappe's request-line length limit and returns
   * 400. Filtering to `attached_to_doctype = 'Item'` and matching here is cheap,
   * since the total number of attached files is small regardless of item count.
   */
  const files = await frappe.getList<{
    name: string;
    file_name: string;
    attached_to_name: string;
  }>('File', {
    fields: ['name', 'file_name', 'attached_to_name'],
    filters: [['attached_to_doctype', '=', 'Item']],
    limit: 500,
  });

  const filesByItem: Record<string, { id: string; name: string }[]> = {};
  for (const f of files) {
    (filesByItem[f.attached_to_name] ||= []).push({ id: f.name, name: f.file_name });
  }

  return c.json(items.map((item) => ({ ...item, documents: filesByItem[item.item_code] ?? [] })));
});

/** GET /api/inventory/:item_code — single item detail. */
app.get('/:item_code', async (c) => {
  const frappe = createFrappeClient(c.env);
  return c.json(await frappe.getDoc('Item', c.req.param('item_code')));
});

export default app;
