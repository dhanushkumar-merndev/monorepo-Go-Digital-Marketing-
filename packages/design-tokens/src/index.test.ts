import { describe, expect, it } from 'vitest';

import { colors, designTokens, radii, spacing, statuses } from './index.js';

describe('design tokens', () => {
  it('provides every required semantic status', () => {
    expect(Object.keys(statuses)).toEqual(['neutral', 'info', 'success', 'warning', 'danger']);
  });

  it('keeps shared native-friendly values deterministic', () => {
    expect(spacing[4]).toBe(16);
    expect(radii.md).toBe(8);
    expect(colors.primary).toBe(designTokens.colors.primary);
  });
});
