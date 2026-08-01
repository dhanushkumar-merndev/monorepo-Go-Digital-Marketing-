export function cx(...values: (false | null | string | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}
