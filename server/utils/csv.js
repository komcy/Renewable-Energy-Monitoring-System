/**
 * Minimal RFC 4180 CSV writing. Cells starting with = + - @ are prefixed with
 * an apostrophe so spreadsheet apps don't execute them as formulas (CSV
 * injection), except plain negative numbers.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  if (FORMULA_START.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csvRow = (values) => `${values.map(csvCell).join(',')}\r\n`;

/** Builds a whole CSV document from column defs [{ key, label }] and row objects. */
const toCsv = (columns, rows) =>
  csvRow(columns.map((c) => c.label)) + rows.map((r) => csvRow(columns.map((c) => r[c.key]))).join('');

/** Safe file name fragment: "Pune Hybrid Farm" → "pune-hybrid-farm" */
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'report';

module.exports = { csvCell, csvRow, toCsv, slug };
