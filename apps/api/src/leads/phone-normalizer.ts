import { createHmac } from 'node:crypto';

export function normalizeIndianPhone(value: string): string | null {
  const digits = value.replaceAll(/\D/gu, '');
  const national =
    digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/u.test(national) ? `+91${national}` : null;
}

export function phoneLookupHash(
  clientOrganizationId: string,
  phoneE164: string,
  pepper: string,
): string {
  return createHmac('sha256', pepper)
    .update(`${clientOrganizationId}\u0000${phoneE164}`, 'utf8')
    .digest('hex');
}
