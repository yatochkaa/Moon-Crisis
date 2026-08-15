import type {
  ActiveDeliveryDto,
  GameStateDto,
  LocationDto,
  RoverDto,
} from '@/application/dto'
import { ZONE_LABELS } from '@/shared/messages'

type Props = {
  base: GameStateDto['base']
  locations: readonly LocationDto[]
  rovers?: readonly RoverDto[]
  selectedLocation: LocationDto | null
  activeDeliveries?: readonly ActiveDeliveryDto[]
  /** Shared client clock in ms; drives every marker position. */
  now?: number
}

const ZONE_FILL: Record<LocationDto['zoneType'], string> = {
  plain: '#38bdf8',
  crater: '#fbbf24',
  dark: '#a78bfa',
}

type Point = { x: number; y: number }

/**
 * Two-phase progress of a round trip driven by the server startedAt/completesAt.
 *
 * The first half of the window is the outbound leg (base -> station), the second
 * half is the return leg (station -> base). The marker position is therefore
 * fully reconstructable after a refresh from persisted timestamps alone, so
 * setTimeout is never the source of truth (requirements 2, 3, 6, 11, 12).
 */
function markerPosition(
  base: Point,
  target: Point,
  startedAtMs: number,
  completesAtMs: number,
  now: number,
): { position: Point; outbound: boolean } {
  const total = Math.max(completesAtMs - startedAtMs, 1)
  const elapsed = Math.min(Math.max(now - startedAtMs, 0), total)
  const progress = elapsed / total
  const outbound = progress < 0.5

  const legFraction = outbound ? progress / 0.5 : (progress - 0.5) / 0.5
  const from = outbound ? base : target
  const to = outbound ? target : base

  return {
    position: {
      x: from.x + (to.x - from.x) * legFraction,
      y: from.y + (to.y - from.y) * legFraction,
    },
    outbound,
  }
}

/**
 * Temporary placeholder map.
 *
 * Plain inline SVG on purpose: no map library is used and the final visual
 * design is a separate stage. Every parallel active delivery is drawn with its
 * own route and moving marker (requirements 8 and 9).
 */
export function MoonMap({
  base,
  locations,
  rovers = [],
  selectedLocation,
  activeDeliveries = [],
  now = Date.now(),
}: Props): React.JSX.Element {
  const roverNameById = new Map(rovers.map((rover) => [rover.id, rover.name]))

  const markers = activeDeliveries.flatMap((delivery) => {
    const target =
      locations.find((location) => location.id === delivery.locationId) ?? null
    if (target === null) return []

    const { position, outbound } = markerPosition(
      base,
      target,
      Date.parse(delivery.startedAt),
      Date.parse(delivery.completesAt),
      now,
    )

    return [
      {
        deliveryId: delivery.deliveryId,
        roverId: delivery.roverId,
        roverName: roverNameById.get(delivery.roverId) ?? delivery.roverId,
        target,
        position,
        outbound,
      },
    ]
  })

  return (
    <section aria-label="Карта" className="rounded border border-slate-700 p-3">
      <h2 className="mb-2 font-semibold">Карта (плейсхолдер)</h2>
      <svg
        viewBox="0 0 300 300"
        role="img"
        aria-label="Схематичная карта базы и локаций"
        className="h-auto w-full rounded bg-slate-900"
      >
        {selectedLocation !== null ? (
          <line
            x1={base.x}
            y1={base.y}
            x2={selectedLocation.x}
            y2={selectedLocation.y}
            stroke="#e2e8f0"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ) : null}

        {markers.map((marker) => (
          <g
            key={marker.deliveryId}
            data-testid={`rover-marker-${marker.roverId}`}
          >
            <line
              x1={base.x}
              y1={base.y}
              x2={marker.target.x}
              y2={marker.target.y}
              stroke="#38bdf8"
              strokeWidth={1.5}
            />
            <circle
              cx={marker.position.x}
              cy={marker.position.y}
              r={5}
              fill={marker.outbound ? '#38bdf8' : '#22c55e'}
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <text
              x={marker.position.x + 7}
              y={marker.position.y - 6}
              fill="#e2e8f0"
              fontSize={7}
            >
              {marker.roverName}
            </text>
          </g>
        ))}

        <circle cx={base.x} cy={base.y} r={6} fill="#e2e8f0" />
        <text x={base.x + 9} y={base.y + 4} fill="#e2e8f0" fontSize={9}>
          База
        </text>

        {locations.map((location) => {
          const isSelected = location.id === selectedLocation?.id

          return (
            <g key={location.id}>
              <circle
                cx={location.x}
                cy={location.y}
                r={isSelected ? 7 : 4.5}
                fill={ZONE_FILL[location.zoneType]}
                stroke={isSelected ? '#ffffff' : 'none'}
                strokeWidth={isSelected ? 2 : 0}
              />
              <text
                x={location.x + 9}
                y={location.y + 4}
                fill="#cbd5e1"
                fontSize={8}
              >
                {location.name} ({ZONE_LABELS[location.zoneType]})
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-2 text-xs text-slate-400">
        Цвет точки дублируется текстом: тип зоны указан рядом с названием.
      </p>
    </section>
  )
}
