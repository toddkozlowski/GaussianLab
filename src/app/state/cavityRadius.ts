/**
 * A cavity mirror's radius of curvature is stored as Infinity to encode
 * "flat" (see the Canvas and Sidebar "flat" controls). Typing an empty
 * field commits that same Infinity rather than being rejected as invalid.
 */
export function parseCavityRadius(text: string): number | null {
  if (text.trim() === '') {
    return Number.POSITIVE_INFINITY;
  }
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}
