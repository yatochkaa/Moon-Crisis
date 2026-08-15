'use client'

/**
 * SVG lunar map — the primary element of the «Операции» screen.
 *
 * Every real object (base, stations, in-transit rovers) comes from the server
 * DTOs; nothing here touches game rules, formulas or delivery logic. The map is
 * purely presentational.
 *
 * Coordinate system
 * -----------------
 * Game coordinates live in a 0..300 space (seed + defaults). To keep the base
 * and the outermost stations on screen while the SVG uses
 * `preserveAspectRatio="xMidYMid slice"` to fully cover the map stage, the game
 * space is centred inside a larger 420x420 viewBox with a `GAME_OFFSET` margin
 * of decorative lunar surface on every side. `slice` only ever crops that
 * decorative margin, never the game content.
 *
 * Replacing the surface with a real photo later
 * ---------------------------------------------
 * Drop a local `public/images/lunar-surface.webp` and set `LUNAR_SURFACE_SRC`
 * to `'/images/lunar-surface.webp'`. The `<image>` layer then covers the
 * procedural SVG surface without touching any route or station coordinate. When
 * the constant is `null` (default) no network request is made at runtime.
 */

import type {
  ActiveDeliveryDto,
  GameStateDto,
  LocationDto,
} from '@/application/dto'
import type { ZoneType } from '@/domain/types'
import { ZONE_LABELS } from '@/shared/messages'
import { roverColor } from '@/shared/roverColors'
import { CompassIcon, RoverMarkerIcon } from '@/components/ui/icons'

type Props = {
  base: GameStateDto['base']
  locations: readonly LocationDto[]
  rovers: GameStateDto['rovers']
  selectedLocation: LocationDto | null
  activeDeliveries: readonly ActiveDeliveryDto[]
  /** Shared client clock in ms; drives every marker position. */
  now: number
}

type Point = { x: number; y: number }

/** Decorative margin (viewBox units) of lunar surface around the game space. */
const GAME_OFFSET = 60
const VIEWBOX = 420

/**
 * Local lunar photo path. Set to `'/images/lunar-surface.webp'` after dropping
 * the file into `public/images/`. Kept `null` so the procedural SVG surface is
 * used with zero runtime network requests.
 */
const LUNAR_SURFACE_SRC: string | null = '/images/lunar-surface.webp'

/** Whether a real lunar photo is configured as the bottom map layer. */
const HAS_PHOTO = LUNAR_SURFACE_SRC !== null

/**
 * Purely-visual per-station nudges (in game units) so markers line up with real
 * craters on the photo. These affect ONLY where the marker/route is drawn — the
 * server DTO coordinates, distances, formulas and Prisma data are untouched, so
 * gameplay is identical. Keyed by station name; tweak the numbers to taste.
 */
const DISPLAY_OFFSETS: Record<string, { dx: number; dy: number }> = {
  'Кратер Коперник': { dx: 14, dy: -24 },
}

function displayXY(loc: { name: string; x: number; y: number }): Point {
  const offset = DISPLAY_OFFSETS[loc.name] ?? { dx: 0, dy: 0 }
  return { x: loc.x + offset.dx, y: loc.y + offset.dy }
}

/* --------------------------------------------------------------------------
 * Geometry helpers (quadratic Bézier). Timing/progress logic is unchanged —
 * only the visual path is a gentle curve, and the marker is sampled from the
 * SAME curve so it always sits exactly on its route.
 * ------------------------------------------------------------------------ */

function controlPoint(a: Point, b: Point): Point {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const bow = len * 0.14
  // perpendicular unit vector, bowing every route the same way
  return { x: mx - (dy / len) * bow, y: my + (dx / len) * bow }
}

function bezierAt(a: Point, c: Point, b: Point, t: number): Point {
  const mt = 1 - t
  return {
    x: mt * mt * a.x + 2 * mt * t * c.x + t * t * b.x,
    y: mt * mt * a.y + 2 * mt * t * c.y + t * t * b.y,
  }
}

function bezierAngle(a: Point, c: Point, b: Point, t: number): number {
  const mt = 1 - t
  const dx = 2 * mt * (c.x - a.x) + 2 * t * (b.x - c.x)
  const dy = 2 * mt * (c.y - a.y) + 2 * t * (b.y - c.y)
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

function bezierPath(a: Point, c: Point, b: Point): string {
  return `M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`
}

/** Sampled polyline of the curve from t0..1 (for partial / danger segments). */
function bezierSubPath(a: Point, c: Point, b: Point, t0: number): string {
  const steps = 16
  let d = ''
  for (let i = 0; i <= steps; i += 1) {
    const t = t0 + (1 - t0) * (i / steps)
    const p = bezierAt(a, c, b, t)
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }
  return d
}

/**
 * Two-phase progress of a round trip driven by the server startedAt/completesAt.
 * First half = outbound (base -> station), second half = return. Timing is
 * identical to before; the position is now sampled from the route curve.
 */
function deliveryGeometry(
  base: Point,
  target: Point,
  startedAtMs: number,
  completesAtMs: number,
  now: number,
): {
  outbound: boolean
  legT: number
  from: Point
  to: Point
  control: Point
  position: Point
  angle: number
} {
  const total = Math.max(completesAtMs - startedAtMs, 1)
  const elapsed = Math.min(Math.max(now - startedAtMs, 0), total)
  const progress = elapsed / total
  const outbound = progress < 0.5
  const legT = outbound ? progress / 0.5 : (progress - 0.5) / 0.5
  const from = outbound ? base : target
  const to = outbound ? target : base
  const control = controlPoint(from, to)
  return {
    outbound,
    legT,
    from,
    to,
    control,
    position: bezierAt(from, control, to, legT),
    angle: bezierAngle(from, control, to, legT),
  }
}

function remainingLabel(completesAt: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(completesAt) - now) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

/* --------------------------------------------------------------------------
 * Deterministic regolith speckle field (no Math.random, so SSR === CSR).
 * A scatter of faint dots reads as fine dust without an obvious repeating tile.
 * ------------------------------------------------------------------------ */
const SPECKLES: ReadonlyArray<readonly [number, number, number, number]> =
  (() => {
    let seed = 20260815
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const dots: Array<[number, number, number, number]> = []
    for (let i = 0; i < 90; i += 1) {
      dots.push([
        Math.round(rand() * VIEWBOX),
        Math.round(rand() * VIEWBOX),
        Number((0.3 + rand() * 0.7).toFixed(2)),
        Number((0.03 + rand() * 0.05).toFixed(3)),
      ])
    }
    return dots
  })()

/** Irregular decorative craters in viewBox space: [cx, cy, rx, ry, rot]. */
const DECOR_CRATERS: ReadonlyArray<
  readonly [number, number, number, number, number]
> = [
  [95, 92, 15, 12, -18],
  [330, 118, 12, 14, 12],
  [300, 96, 8, 7, 0],
  [92, 210, 11, 9, 24],
  [352, 212, 10, 11, -10],
  [250, 300, 9, 8, 6],
  [150, 176, 7, 6, 0],
  [372, 300, 13, 15, -14],
  [70, 320, 10, 9, 8],
]

/** A dense, natural-looking cluster (the “crater field”), viewBox space. */
const CRATER_FIELD: ReadonlyArray<readonly [number, number, number]> = [
  [186, 150, 6],
  [200, 143, 3.5],
  [176, 138, 4.5],
  [208, 158, 3],
  [193, 163, 2.8],
  [170, 152, 3.2],
  [214, 147, 3.6],
  [180, 165, 2.4],
  [198, 132, 2.6],
]

function Crater({
  cx,
  cy,
  rx,
  ry,
  rot,
}: {
  cx: number
  cy: number
  rx: number
  ry: number
  rot: number
}): React.JSX.Element {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`}>
      {/* bowl with a soft inner shadow */}
      <ellipse rx={rx} ry={ry} fill="url(#mcc-crater-bowl)" />
      {/* sunlit rim on the upper-left, shadow rim on the lower-right */}
      <path
        d={`M${-rx * 0.7} ${-ry * 0.7} A${rx} ${ry} 0 0 1 ${rx * 0.7} ${-ry * 0.7}`}
        fill="none"
        stroke="oklch(1 0 0 / 0.16)"
        strokeWidth={0.8}
      />
      <path
        d={`M${rx * 0.7} ${ry * 0.6} A${rx} ${ry} 0 0 1 ${-rx * 0.7} ${ry * 0.7}`}
        fill="none"
        stroke="oklch(0 0 0 / 0.28)"
        strokeWidth={0.8}
      />
    </g>
  )
}

/* --------------------------------------------------------------------------
 * Location markers — a distinct shape per kind, each with a <title> for AT.
 * All markers are drawn centred on (0,0); the caller translates them.
 * ------------------------------------------------------------------------ */

function BaseMarker(): React.JSX.Element {
  return (
    <g>
      <circle r={13} fill="var(--primary)" opacity={0.14} />
      <circle r={9} fill="var(--primary)" opacity={0.1} />
      {/* landing legs */}
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={deg}
          x1={0}
          y1={0}
          x2={0}
          y2={-9.5}
          transform={`rotate(${deg + 45})`}
          stroke="oklch(1 0 0 / 0.5)"
          strokeWidth={0.9}
        />
      ))}
      {/* four-section landing module */}
      <circle r={7} fill="oklch(0.42 0.006 250)" stroke="oklch(1 0 0 / 0.55)" strokeWidth={1} />
      <line x1={-7} y1={0} x2={7} y2={0} stroke="oklch(1 0 0 / 0.35)" strokeWidth={0.7} />
      <line x1={0} y1={-7} x2={0} y2={7} stroke="oklch(1 0 0 / 0.35)" strokeWidth={0.7} />
      {/* orange core */}
      <circle r={2.8} fill="var(--primary)" />
    </g>
  )
}

function PlainMarker({ selected }: { selected: boolean }): React.JSX.Element {
  return (
    <g>
      <rect
        x={-4.5}
        y={-3.5}
        width={9}
        height={7}
        rx={1.6}
        fill="oklch(0.5 0.006 250)"
        stroke={selected ? 'var(--primary)' : 'oklch(1 0 0 / 0.5)'}
        strokeWidth={selected ? 1.1 : 0.8}
      />
      {/* blue status indicator */}
      <circle cx={0} cy={-3.5} r={1.7} fill="var(--route)" />
      <circle cx={0} cy={-3.5} r={3} fill="var(--route)" opacity={0.25} />
    </g>
  )
}

function CraterMarker({ selected }: { selected: boolean }): React.JSX.Element {
  return (
    <g>
      {/* crater ring */}
      <circle r={6} fill="oklch(0.34 0.006 250)" stroke="oklch(1 0 0 / 0.45)" strokeWidth={1} />
      <circle r={3} fill="oklch(0.28 0.006 250)" />
      {/* small survey flag */}
      <line x1={0} y1={0} x2={0} y2={-9} stroke="oklch(1 0 0 / 0.7)" strokeWidth={0.9} />
      <path
        d="M0 -9 L5 -7.5 L0 -6 Z"
        fill={selected ? 'var(--primary)' : 'var(--route)'}
      />
    </g>
  )
}

function DarkMarker(): React.JSX.Element {
  return (
    <g>
      {/* amber warning outer ring */}
      <circle
        r={7.5}
        fill="none"
        stroke="var(--danger)"
        strokeWidth={1}
        strokeDasharray="2.5 2"
        opacity={0.85}
      />
      <circle r={4.5} fill="oklch(0.24 0.01 40)" stroke="oklch(0.75 0.16 60)" strokeWidth={0.9} />
      {/* warning beacon */}
      <path d="M0 -3 L2.6 2 L-2.6 2 Z" fill="oklch(0.8 0.17 60)" />
      <rect x={-0.5} y={-0.6} width={1} height={1.8} fill="oklch(0.2 0.02 40)" />
      <circle cx={0} cy={2.6} r={0.6} fill="oklch(0.2 0.02 40)" />
    </g>
  )
}

function StationLabel({
  name,
  zoneType,
  riskBonus,
  detailed,
  below,
}: {
  name: string
  zoneType: ZoneType
  riskBonus: number
  /** Selected or active: show zone type + zone risk on a second line. */
  detailed: boolean
  /** Place the label under the marker (used for markers near the top edge). */
  below: boolean
}): React.JSX.Element {
  const line2 =
    riskBonus > 0
      ? `${ZONE_LABELS[zoneType]} · +${riskBonus}% риск`
      : ZONE_LABELS[zoneType]
  // Normal labels are ~12% smaller than before; selected/active stay larger.
  const nameFont = detailed ? 6.4 : 5.6
  const charW = detailed ? 3.5 : 3.05
  const widthCh = Math.max(name.length, detailed ? line2.length : 0)
  const boxW = widthCh * charW + 8
  const boxH = detailed ? 17 : 9.5
  const gap = detailed ? 11 : 10
  const boxY = below ? gap : -gap - boxH

  return (
    <g>
      <rect
        x={-boxW / 2}
        y={boxY}
        width={boxW}
        height={boxH}
        rx={2.5}
        fill="oklch(0.16 0.006 250 / 0.72)"
      />
      <text
        x={0}
        y={boxY + (detailed ? 7 : 6.6)}
        textAnchor="middle"
        fill="oklch(0.98 0 0)"
        style={{ fontSize: nameFont, fontWeight: 500 }}
      >
        {name}
      </text>
      {detailed ? (
        <text
          x={0}
          y={boxY + 14}
          textAnchor="middle"
          fill="oklch(0.85 0.02 250)"
          style={{ fontSize: 5.2 }}
        >
          {line2}
        </text>
      ) : null}
    </g>
  )
}

function StationMarker({
  location,
  isSelected,
  isActive,
}: {
  location: LocationDto
  isSelected: boolean
  isActive: boolean
}): React.JSX.Element {
  const pos = displayXY(location)
  const below = pos.y < 26
  const shape =
    location.zoneType === 'plain' ? (
      <PlainMarker selected={isSelected} />
    ) : location.zoneType === 'crater' ? (
      <CraterMarker selected={isSelected} />
    ) : (
      <DarkMarker />
    )

  return (
    <g transform={`translate(${pos.x} ${pos.y})`}>
      <title>{`${location.name} — ${ZONE_LABELS[location.zoneType]}${
        location.riskBonus > 0 ? `, +${location.riskBonus}% риск` : ''
      }`}</title>
      {isActive ? (
        <circle
          r={11}
          className="mcc-station-pulse fill-none stroke-route/70"
          strokeWidth={0.8}
        />
      ) : null}
      {isSelected ? (
        <circle
          r={10}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity={0.7}
          strokeWidth={0.8}
          strokeDasharray="2 2"
        />
      ) : null}
      {shape}
      <StationLabel
        name={location.name}
        zoneType={location.zoneType}
        riskBonus={location.riskBonus}
        detailed={isSelected || isActive}
        below={below}
      />
    </g>
  )
}

function LegendSwatch({
  kind,
}: {
  kind: 'plain' | 'crater' | 'dark' | 'selected' | 'active' | 'danger'
}): React.JSX.Element {
  if (kind === 'selected' || kind === 'active' || kind === 'danger') {
    const color =
      kind === 'selected'
        ? 'var(--primary)'
        : kind === 'active'
          ? 'var(--route)'
          : 'var(--danger)'
    return (
      <span
        className="inline-block h-0.5 w-4 rounded-full"
        style={{ background: color }}
      />
    )
  }
  const style: React.CSSProperties =
    kind === 'plain'
      ? { background: 'oklch(0.5 0.006 250)' }
      : kind === 'crater'
        ? {
            backgroundColor: 'oklch(0.38 0.006 250)',
            backgroundImage:
              'radial-gradient(oklch(1 0 0 / 0.3) 0.6px, transparent 0.8px)',
            backgroundSize: '3px 3px',
          }
        : { background: 'oklch(0.2 0.01 40)' }
  return (
    <span
      className="inline-block h-3 w-3 rounded-sm border border-white/20"
      style={style}
    />
  )
}

export function MoonMapView({
  base,
  locations,
  rovers,
  selectedLocation,
  activeDeliveries,
  now,
}: Props): React.JSX.Element {
  const roverNameById = new Map(rovers.map((rover) => [rover.id, rover.name]))
  const locationById = new Map(locations.map((loc) => [loc.id, loc]))
  const activeLocationIds = new Set(
    activeDeliveries.map((delivery) => delivery.locationId),
  )

  const markers = activeDeliveries.flatMap((delivery) => {
    const target = locationById.get(delivery.locationId) ?? null
    if (target === null) return []
    const geom = deliveryGeometry(
      base,
      displayXY(target),
      Date.parse(delivery.startedAt),
      Date.parse(delivery.completesAt),
      now,
    )
    return [
      {
        deliveryId: delivery.deliveryId,
        roverId: delivery.roverId,
        roverName: roverNameById.get(delivery.roverId) ?? delivery.roverId,
        color: roverColor(delivery.roverId),
        dangerous: target.riskBonus > 0,
        remaining: remainingLabel(delivery.completesAt, now),
        ...geom,
      },
    ]
  })

  // Cascade captions of markers that sit close together so they never stack.
  const CASCADE_RADIUS = 18
  const CASCADE_STEP = 8
  const labelOffsets = markers.map((marker, index) => {
    let overlaps = 0
    for (let other = 0; other < index; other += 1) {
      const otherMarker = markers[other]
      if (otherMarker === undefined) continue
      const dx = marker.position.x - otherMarker.position.x
      const dy = marker.position.y - otherMarker.position.y
      if (Math.hypot(dx, dy) < CASCADE_RADIUS) overlaps += 1
    }
    return overlaps * CASCADE_STEP
  })

  const selectedControl =
    selectedLocation !== null
      ? controlPoint(base, displayXY(selectedLocation))
      : null

  return (
    <section
      aria-label="Карта"
      className="relative h-full w-full overflow-hidden rounded-lg border border-border"
    >
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label="Карта поверхности Луны с базой, станциями и активными маршрутами"
      >
        <defs>
          {/* overall surface: lighter north-west, naturally darker south */}
          <radialGradient id="mcc-surface" cx="42%" cy="30%" r="90%">
            <stop offset="0%" stopColor="oklch(0.56 0.006 250)" />
            <stop offset="45%" stopColor="oklch(0.48 0.006 250)" />
            <stop offset="78%" stopColor="oklch(0.38 0.006 250)" />
            <stop offset="100%" stopColor="oklch(0.28 0.008 260)" />
          </radialGradient>
          <radialGradient id="mcc-crater-bowl" cx="38%" cy="32%" r="75%">
            <stop offset="0%" stopColor="oklch(0.3 0.006 250)" />
            <stop offset="65%" stopColor="oklch(0.37 0.006 250)" />
            <stop offset="100%" stopColor="oklch(0.5 0.006 250)" />
          </radialGradient>
          {/* soft darkening for the southern dark-zone territory */}
          <radialGradient id="mcc-dark-zone" cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor="oklch(0.18 0.01 260 / 0.85)" />
            <stop offset="70%" stopColor="oklch(0.2 0.01 260 / 0.5)" />
            <stop offset="100%" stopColor="oklch(0.22 0.01 260 / 0)" />
          </radialGradient>
          {/* readability vignette so labels stay legible over bright surface */}
          <radialGradient id="mcc-vignette" cx="50%" cy="48%" r="70%">
            <stop offset="0%" stopColor="oklch(0 0 0 / 0)" />
            <stop offset="78%" stopColor="oklch(0 0 0 / 0)" />
            <stop offset="100%" stopColor="oklch(0 0 0 / 0.35)" />
          </radialGradient>
        </defs>

        {/* Bottom layer. A solid dark base first (no bright flash before the
            photo paints), then either the real lunar photo or the procedural
            gradient surface as the fallback. */}
        <rect
          x={0}
          y={0}
          width={VIEWBOX}
          height={VIEWBOX}
          fill={HAS_PHOTO ? 'oklch(0.14 0.01 260)' : 'url(#mcc-surface)'}
        />
        {LUNAR_SURFACE_SRC !== null ? (
          <>
            <image
              href={LUNAR_SURFACE_SRC}
              x={0}
              y={0}
              width={VIEWBOX}
              height={VIEWBOX}
              preserveAspectRatio="xMidYMid slice"
            />
            {/* static dark layer: enough opacity for readable white text */}
            <rect
              x={0}
              y={0}
              width={VIEWBOX}
              height={VIEWBOX}
              fill="oklch(0 0 0)"
              opacity={0.42}
            />
          </>
        ) : null}

        {/* Procedural relief (dust, ridges, craters). Only the fallback surface
            uses it — once the photo provides real relief it is muted away so it
            never duplicates the terrain. */}
        {!HAS_PHOTO ? (
          <>
            <g>
              {SPECKLES.map(([x, y, r, o], i) => (
                <circle key={`sp${i}`} cx={x} cy={y} r={r} fill="oklch(1 0 0)" opacity={o} />
              ))}
            </g>
            <g fill="none" stroke="oklch(1 0 0 / 0.14)" strokeWidth={0.8} strokeLinejoin="round">
              <path d="M60 250 l 10 -16 l 8 12 l 11 -20 l 9 16 l 7 -9" />
              <path d="M250 150 l 9 -14 l 7 10 l 10 -17 l 8 13" />
            </g>
            <g fill="none" stroke="oklch(0 0 0 / 0.2)" strokeWidth={0.8} strokeLinejoin="round">
              <path d="M61 251 l 10 -16 l 8 12 l 11 -20 l 9 16 l 7 -9" transform="translate(0 1.4)" />
            </g>
            {DECOR_CRATERS.map(([cx, cy, rx, ry, rot], i) => (
              <Crater key={`dc${i}`} cx={cx} cy={cy} rx={rx} ry={ry} rot={rot} />
            ))}
          </>
        ) : null}

        {/* ===== Territories (decorative, drawn in game space) ===== */}
        <g transform={`translate(${GAME_OFFSET} ${GAME_OFFSET})`}>
          {/* Dark zone: a darkened southern region with a faint dashed border.
              With a real photo we drop the darkening fill (the photo already has
              its own shadow) and keep only the border + label. */}
          <g>
            {!HAS_PHOTO ? (
              <path
                d="M-40 150 Q 90 120 180 155 Q 300 190 340 300 L 340 360 L -40 360 Z"
                fill="url(#mcc-dark-zone)"
              />
            ) : null}
            <path
              d="M-40 150 Q 90 120 180 155 Q 300 190 340 300"
              fill="none"
              stroke="oklch(1 0 0 / 0.14)"
              strokeWidth={0.7}
              strokeDasharray="4 4"
            />
            <text
              x={95}
              y={235}
              textAnchor="middle"
              fill="oklch(1 0 0 / 0.28)"
              style={{ fontSize: 7, letterSpacing: 1.2, fontWeight: 500 }}
            >
              ТЁМНАЯ ЗОНА
            </text>
          </g>
		  
        </g>

        {/* soft edge vignette for label readability */}
        <rect x={0} y={0} width={VIEWBOX} height={VIEWBOX} fill="url(#mcc-vignette)" />

        {/* ===== Game content (base, routes, rovers, stations) ===== */}
        <g transform={`translate(${GAME_OFFSET} ${GAME_OFFSET})`}>
          {/* selected planning route: gentle orange dashed Bézier */}
          {selectedLocation !== null && selectedControl !== null ? (
            <g>
              <path
                d={bezierPath(base, selectedControl, displayXY(selectedLocation))}
                className="mcc-route-glow"
                stroke={
                  selectedLocation.riskBonus > 0
                    ? 'var(--danger)'
                    : 'var(--primary)'
                }
                strokeOpacity={0.22}
                strokeWidth={4}
                strokeLinecap="round"
                fill="none"
              />
              <path
                d={bezierPath(base, selectedControl, displayXY(selectedLocation))}
                stroke="var(--primary)"
                strokeWidth={1.3}
                strokeDasharray="4 3"
                strokeLinecap="round"
                fill="none"
              />
              {/* red dashes only on the dangerous part (nearest the station) */}
              {selectedLocation.riskBonus > 0 ? (
                <path
                  d={bezierSubPath(
                    base,
                    selectedControl,
                    displayXY(selectedLocation),
                    0.55,
                  )}
                  stroke="var(--danger)"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  strokeLinecap="round"
                  fill="none"
                />
              ) : null}
            </g>
          ) : null}

          {/* active deliveries: one arc + moving rover per delivery */}
          {markers.map((marker, markerIndex) => {
            const dangerColor = marker.dangerous ? 'var(--danger)' : 'var(--route)'
            return (
              <g
                key={marker.deliveryId}
                data-testid={`rover-marker-${marker.roverId}`}
              >
                {/* full leg, dim = already travelled */}
                <path
                  d={bezierPath(marker.from, marker.control, marker.to)}
                  stroke="var(--route)"
                  strokeOpacity={0.28}
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  fill="none"
                />
                {/* remaining part, brighter */}
                <path
                  d={bezierSubPath(
                    marker.from,
                    marker.control,
                    marker.to,
                    marker.legT,
                  )}
                  stroke={dangerColor}
                  strokeOpacity={0.9}
                  strokeWidth={1.3}
                  strokeLinecap="round"
                  fill="none"
                />
                {/* dashes flowing along the remaining part only */}
                <path
                  d={bezierSubPath(
                    marker.from,
                    marker.control,
                    marker.to,
                    marker.legT,
                  )}
                  className="mcc-route-flow"
                  stroke={dangerColor}
                  strokeWidth={1.2}
                  strokeDasharray="2 8"
                  strokeLinecap="round"
                  fill="none"
                />
                <g transform={`translate(${marker.position.x} ${marker.position.y})`}>
                  <circle
                    r={7}
                    className="mcc-rover-halo"
                    style={{ fill: marker.color, fillOpacity: 0.16 }}
                  />
                  <circle
                    r={5.6}
                    style={{
                      fill: marker.color,
                      fillOpacity: marker.outbound ? 0.22 : 0.15,
                      stroke: marker.color,
                      strokeOpacity: marker.outbound ? 1 : 0.7,
                    }}
                    strokeWidth={0.8}
                  />
                  <g transform={`rotate(${marker.angle})`} style={{ color: marker.color }}>
                    <RoverMarkerIcon x={-4.5} y={-4.5} size={9} />
                  </g>
                  <text
                    y={13 + (labelOffsets[markerIndex] ?? 0)}
                    textAnchor="middle"
                    className="font-mono"
                    style={{
                      fill: marker.color,
                      fontSize: 6,
                      paintOrder: 'stroke',
                      stroke: 'oklch(0.16 0.006 250 / 0.85)',
                      strokeWidth: 2.4,
                    }}
                  >
                    {marker.roverName} · {marker.remaining}
                  </text>
                </g>
              </g>
            )
          })}

          {/* stations */}
          {locations.map((location) => (
            <StationMarker
              key={location.id}
              location={location}
              isSelected={location.id === selectedLocation?.id}
              isActive={activeLocationIds.has(location.id)}
            />
          ))}

          {/* base landing module + label */}
          <g transform={`translate(${base.x} ${base.y})`}>
            <title>База — стартовая площадка курьеров</title>
            <BaseMarker />
            <g>
              <rect x={-16} y={11} width={32} height={10.5} rx={2.5} fill="oklch(0.16 0.006 250 / 0.72)" />
              <text
                x={0}
                y={18.4}
                textAnchor="middle"
                fill="oklch(0.98 0 0)"
                style={{ fontSize: 6.4, fontWeight: 600 }}
              >
                База
              </text>
            </g>
          </g>
        </g>
      </svg>

      {/* North indicator (HTML overlay, bottom-right so it never fights the
          top-right delivery toast). */}
      <div className="absolute bottom-3 right-3 flex flex-col items-center gap-0.5 rounded-md border border-border bg-panel/80 px-2 py-1.5 backdrop-blur-sm">
        <CompassIcon className="text-primary" size={14} />
        <span className="font-mono text-[10px] text-muted-foreground">С</span>
      </div>

      {/* Scale (HTML overlay) */}
      <div className="absolute bottom-[68px] right-3 flex flex-col items-end gap-1 rounded-md border border-border bg-panel/80 px-2 py-1.5 backdrop-blur-sm">
        <div className="h-1 w-14 border-x border-b border-white/50" />
        <span className="font-mono text-[10px] text-muted-foreground">120 км</span>
      </div>

      {/* Compact legend with real texture swatches (HTML overlay) */}
      <div className="absolute left-3 top-3 space-y-1 rounded-md border border-border bg-panel/85 px-2.5 py-2 text-[11px] backdrop-blur-sm">
        <div className="mb-0.5 font-medium text-foreground">Территория</div>
        <div className="flex items-center gap-1.5"><LegendSwatch kind="plain" /><span className="text-muted-foreground">Равнина</span></div>
        <div className="flex items-center gap-1.5"><LegendSwatch kind="crater" /><span className="text-muted-foreground">Поле кратеров</span></div>
        <div className="flex items-center gap-1.5"><LegendSwatch kind="dark" /><span className="text-muted-foreground">Тёмная зона</span></div>
        <div className="my-1 h-px bg-border" />
        <div className="flex items-center gap-1.5"><LegendSwatch kind="selected" /><span className="text-muted-foreground">Выбранный</span></div>
        <div className="flex items-center gap-1.5"><LegendSwatch kind="active" /><span className="text-muted-foreground">Активный</span></div>
        <div className="flex items-center gap-1.5"><LegendSwatch kind="danger" /><span className="text-muted-foreground">Опасный</span></div>
      </div>
    </section>
  )
}
