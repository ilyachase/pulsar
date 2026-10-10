const PALETTE = [
  '#1a73e8',
  '#188038',
  '#e37400',
  '#9334e6',
  '#d93025',
  '#007b83',
  '#c5221f',
  '#5f6368',
];

export function avatarColor(key: string): string {
  // FNV-1a: spreads well even in the low bits (a plain *31 hash collides modulo 8)
  let h = 0x811c9dc5;
  for (const ch of key) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193);
  return PALETTE[(h >>> 0) % PALETTE.length] as string;
}

/** Today → "12:41", yesterday → "вчера", this year → "8 окт.", otherwise → "08.10.2025" */
export function formatTime(ts: number, now: Date = new Date()): string {
  if (!ts) return '';
  const d = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (ts >= startOfToday - 86_400_000) return 'вчера';
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('ru-RU');
}
