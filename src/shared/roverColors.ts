/**
 * Stable per-rover colours used across the map (SVG icon, marker glow, name
 * label) and the fleet cards (small indicator dot).
 *
 * These are purely presentational: they identify a rover consistently and are
 * always paired with the rover name and travel direction, so information is
 * never conveyed by colour alone. They intentionally differ from the route
 * colours (active delivery = blue `--route`, selected = orange `--primary`,
 * dangerous = red `--danger`) so a rover marker never blends into its route.
 */

/** Keyed by the server rover id. */
export const ROVER_COLORS: Record<string, string> = {
  // Scout-01 / Скаут-01 — blue (голубой)
  'rover-scout-01': 'oklch(0.74 0.14 235)',
  // Cargo-02 / Карго-02 — amber-orange (янтарно-оранжевый)
  'rover-cargo-02': 'oklch(0.77 0.15 65)',
  // Sprint-03 / Спринт-03 — light green (салатово-зелёный)
  'rover-sprint-03': 'oklch(0.82 0.19 135)',
}

/** Fallback for any rover id without an explicit colour. */
export const DEFAULT_ROVER_COLOR = 'oklch(0.8 0.02 250)'

/** Resolve the stable identity colour for a rover id. */
export function roverColor(roverId: string): string {
  return ROVER_COLORS[roverId] ?? DEFAULT_ROVER_COLOR
}
