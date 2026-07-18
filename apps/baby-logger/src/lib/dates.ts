/** Today's date as yyyy-mm-dd in the device's local timezone (SAST).
 *  `toISOString()` gives the UTC date, which is yesterday between 00:00
 *  and 02:00 SAST — exactly when night feeds and weigh-ins get logged. */
export function localIsoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
