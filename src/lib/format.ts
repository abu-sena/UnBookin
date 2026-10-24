/**
 * Locale-aware formatting helpers (PRD §10: numbers and dates use `id-ID`,
 * IDR currency without decimals).
 */

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/**
 * Formats an IDR amount, e.g. 59000 → "Rp 59.000".
 * `Intl` may emit a narrow no-break space (U+202F) or a no-break space
 * (U+00A0) after the currency symbol depending on the ICU version; both are
 * normalised to a plain space so the output is stable everywhere.
 */
export function formatIdr(amount: number): string {
  return idrFormatter.format(amount).replace(/[\u00a0\u202f]/g, ' ');
}
