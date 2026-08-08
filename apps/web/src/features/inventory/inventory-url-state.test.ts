import { describe, expect, it } from 'vitest';
import { parseInventoryView } from './inventory-url-state';

describe('inventory URL state', () => {
  it('keeps supported shareable views in the URL and rejects stale values', () => {
    expect(parseInventoryView('ALLOCATIONS')).toBe('ALLOCATIONS');
    expect(parseInventoryView('IMPORT')).toBe('IMPORT');
    expect(parseInventoryView('payment')).toBe('STOCK');
    expect(parseInventoryView(null)).toBe('STOCK');
  });
});
