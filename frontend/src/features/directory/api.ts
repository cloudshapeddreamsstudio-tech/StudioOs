import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Read hooks for the three directory pages — clients, vendors, inventory.
 *
 * Grouped in one module because they are the same shape of thing (a list
 * fetched once and rendered in a table) and splitting them into three
 * near-identical files would be noise.
 */

export interface Client {
  name: string;
  customer_name: string;
  customer_type: string | null;
  email_id: string | null;
  mobile_no: string | null;
  disabled: number;
  outstandingReceivables: number;
  projectCount: number;
}

export interface Vendor {
  name: string;
  supplier_name: string;
  supplier_group: string | null;
  supplier_type: string | null;
  email_id: string | null;
  mobile_no: string | null;
  country: string | null;
  disabled: number;
}

export interface InventoryItem {
  item_code: string;
  item_name: string;
  item_group: string;
  stock_uom: string;
  standard_rate: number | null;
  description: string | null;
  /** In-house gear only: Available / Rented Out / In Repair / In Maintenance. */
  equipment_status: string | null;
  /** Rental-house gear only: which supplier it comes from. */
  rental_source: string | null;
  documents: { id: string; name: string }[];
}

export function useClients() {
  return useQuery({ queryKey: ['clients'], queryFn: () => api.get<Client[]>('/clients') });
}

export function useVendors() {
  return useQuery({ queryKey: ['vendors'], queryFn: () => api.get<Vendor[]>('/vendors') });
}

export interface InventoryResponse {
  items: InventoryItem[];
  /**
   * Custom fields this studio's ERPNext does not have. Non-empty means the
   * column is **unknown**, not empty — see backend lib/optionalFields.ts. The
   * page must say so rather than counting the absence as a good result.
   */
  missingFields: string[];
}

export function useInventory() {
  return useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get<InventoryResponse>('/inventory'),
  });
}

/** Attached bills/warranties are proxied through the Worker, not fetched from
 *  ERPNext directly — the browser never holds ERPNext credentials. */
export function inventoryFileUrl(fileId: string): string {
  return `/api/inventory/files/${encodeURIComponent(fileId)}/download`;
}
