import equipmentRental from '../../../erpnext/reference/0001_supplier_group_equipment_rental.json';
import type { FrappeClient } from './frappe';

/**
 * Which suppliers are vendors (equipment rental), and which are crew.
 *
 * The top group comes from a file, not from the code: erpnext/reference/0001.
 * Each Supplier Group below it, at any depth, is a vendor group too. Today the
 * new site has `Camera & Lighting` and `Sound & AV` below `Equipment Rental`.
 * A group the studio adds there later is a vendor group with no code change.
 *
 * It was one name in the code, `Rental House`. The new site has no group with
 * that name, so on production each supplier was crew -- the two rental houses
 * too. Malhar, 2026-10-14: option (a) of the v1.0.1 card, item B5.
 */
export const VENDOR_ROOT_GROUP: string = equipmentRental.supplier_group_name;

export interface SupplierGroupRow {
  name: string;
  parent_supplier_group?: string | null;
}

/** The root group and each group below it, from a list of the site's groups. */
export function vendorGroupsFrom(
  groups: SupplierGroupRow[],
  root: string = VENDOR_ROOT_GROUP,
): ReadonlySet<string> {
  const found = new Set<string>([root]);
  // Walk down one level at a time. The loop ends when a pass adds nothing, and
  // a pass can add each group one time at most, so a cycle cannot hang it.
  let added = true;
  while (added) {
    added = false;
    for (const g of groups) {
      if (!found.has(g.name) && g.parent_supplier_group && found.has(g.parent_supplier_group)) {
        found.add(g.name);
        added = true;
      }
    }
  }
  return found;
}

/**
 * The vendor groups of this site. If the site will not list its Supplier
 * Groups, the root alone is used: a supplier directly in `Equipment Rental` is
 * still a vendor, and nothing fails.
 */
export async function readVendorGroups(frappe: Pick<FrappeClient, 'getList'>): Promise<ReadonlySet<string>> {
  const groups = await frappe
    .getList<SupplierGroupRow>('Supplier Group', {
      fields: ['name', 'parent_supplier_group'],
      limit: 1000,
    })
    .catch(() => [] as SupplierGroupRow[]);
  return vendorGroupsFrom(groups);
}

export function isVendorGroup(groups: ReadonlySet<string>, group: string | null | undefined): boolean {
  return !!group && groups.has(group);
}
