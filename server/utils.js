/**
 * Returns the ISO 8601 week start (Monday) for any date in that week.
 * JS getDay() returns 0=Sunday..6=Saturday; `(day + 6) % 7` remaps that to 0=Monday..6=Sunday.
 *
 * @param {string|number|Date} [date] - any date in the target week; defaults to today
 * @returns {string} YYYY-MM-DD of the Monday that starts that week
 */
function isoWeekStart(date) {
  const d = new Date(date ?? Date.now());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().split('T')[0];
}

/**
 * Returns the ISO 8601 week end (Sunday) for any date in that week.
 *
 * @param {string|number|Date} [date]
 * @returns {string} YYYY-MM-DD of the Sunday that ends that week
 */
function isoWeekEnd(date) {
  const d = new Date(date ?? Date.now());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 6);
  return d.toISOString().split('T')[0];
}

module.exports = { isoWeekStart, isoWeekEnd };
