export const INVENTORY_VIEWS = [
  'STOCK',
  'CATALOGUE',
  'RESERVATIONS',
  'ALLOCATIONS',
  'TRANSFERS',
  'DEMOS',
  'EXPECTED',
  'AGING',
  'IMPORT',
] as const;

export type InventoryView = (typeof INVENTORY_VIEWS)[number];

export function parseInventoryView(value: string | null): InventoryView {
  return INVENTORY_VIEWS.find((view) => view === value) ?? 'STOCK';
}
