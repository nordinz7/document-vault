/**
 * Money is stored as integer cents to avoid float drift on SUM().
 * These conversions happen only at the repository boundary.
 */
export const toCents = (ringgit: number): number => Math.round(ringgit * 100);
export const toRinggit = (cents: number): number => cents / 100;
