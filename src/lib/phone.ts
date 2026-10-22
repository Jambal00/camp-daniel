/**
 * One phone format everywhere: (952) 555-0123.
 * US numbers with 10 digits (or 11 starting with 1) are formatted; anything
 * else (international, extensions) is kept as typed so nothing is lost.
 */
export function formatPhone(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return s;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Formats as the person types, once there are enough digits to be sure. */
export function formatPhoneAsTyped(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+') && !raw.trim().startsWith('+1')) return raw;
  const local = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (local.length > 10) return raw;
  if (local.length < 4) return local;
  if (local.length < 7) return `(${local.slice(0, 3)}) ${local.slice(3)}`;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
