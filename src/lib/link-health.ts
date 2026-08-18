/**
 * HTTP status at/above which a fee's source link is treated as unavailable.
 * Shared between Magellan's link-check step (which records the status) and
 * the public profile's per-row source line (which reads it) so the two
 * never drift on the threshold.
 */
export const LINK_UNAVAILABLE_STATUS_THRESHOLD = 400;
