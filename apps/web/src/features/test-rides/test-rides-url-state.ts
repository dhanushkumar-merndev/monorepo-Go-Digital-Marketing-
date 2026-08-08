export type RideView = 'ACTIVE' | 'ALL' | 'TODAY';

export function parseRideView(value: string | null): RideView {
  return value === 'ACTIVE' || value === 'ALL' || value === 'TODAY' ? value : 'TODAY';
}

/** Returns the browser-local calendar date expected by the branch-timezone API filter. */
export function localCalendarDate(value: Date): string {
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
