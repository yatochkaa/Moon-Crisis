/**
 * Minimal local icon set in the visual style of the v0 reference (lucide).
 *
 * The v0 prototype imported `lucide-react`. To keep the working project's
 * dependency graph and lockfile untouched, the handful of icons the Operations
 * screen needs are inlined here as plain stroke SVGs with the same 24x24 grid,
 * 2px stroke and round caps. Swapping this module for `lucide-react` later is a
 * one-line import change per component.
 */

export type IconProps = {
  className?: string
  /** Rendered size in px (both width and height). */
  size?: number
  /** Only used when the icon is placed inside an <svg> map. */
  x?: number
  y?: number
}

function Icon({
  className,
  size = 16,
  x,
  y,
  children,
}: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function MoonIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Icon>
  )
}

export function WalletIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 12h2" />
    </Icon>
  )
}

export function TrendingUpIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </Icon>
  )
}

export function GaugeIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m12 14 4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </Icon>
  )
}

export function AlertTriangleIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Icon>
  )
}

export function TargetIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

export function RefreshIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </Icon>
  )
}

export function WeightIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="5" r="3" />
      <path d="M6.5 8h11l2.5 12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
    </Icon>
  )
}

export function CoinsIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="9" cy="9" r="6" />
      <path d="M15.5 3.9a6 6 0 0 1 0 11.2" />
      <path d="M8 18.7A6 6 0 0 0 19 15" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  )
}

export function LockIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect width="16" height="10" x="4" y="11" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Icon>
  )
}

export function PackageIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </Icon>
  )
}

export function RocketIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M14.5 4.5C17 2 21 2 21 2s0 4-2.5 6.5L13 14l-4-4Z" />
      <path d="M9 10 5.5 9 8 6.5l3 .5" />
      <path d="m14 15 1 3.5L17.5 16l-.5-3" />
    </Icon>
  )
}

export function BatteryIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect width="16" height="10" x="2" y="7" rx="2" />
      <path d="M22 11v2" />
      <path d="M6 11v2" />
      <path d="M10 11v2" />
    </Icon>
  )
}

export function MapPinIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  )
}

export function SendIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21 3 3 10l7 3 3 7Z" />
      <path d="M21 3 10 13" />
    </Icon>
  )
}

export function NavigationIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M3 11l18-8-8 18-2-8Z" />
    </Icon>
  )
}

export function TruckIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M14 17V5H2v12h2" />
      <path d="M14 9h4l4 4v4h-2" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}

export function CrossIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

export function CompassIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" />
    </Icon>
  )
}

export function ScrollIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M8 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6" />
      <path d="M3 5a2 2 0 0 1 4 0v14" />
      <path d="M11 8h6" />
      <path d="M11 12h6" />
      <path d="M11 16h4" />
    </Icon>
  )
}

export function BoxIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <path d="M4 10h16" />
    </Icon>
  )
}

/** Shopping cart: marks the «Магазин базы» section. */
export function ShoppingCartIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h2.5l2.2 11.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L21 7H6" />
    </Icon>
  )
}

/** Play / restart: marks the «Новая игра» action. */
export function PlayIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M21.5 2v6h-6" />
      <path d="M21 12a9 9 0 1 1-3.5-7.1L21.5 8" />
      <path d="M10 9.5v5l4.5-2.5Z" />
    </Icon>
  )
}

/** Lunar rover / transport module used as the moving map marker. */
export function RoverMarkerIcon(props: IconProps): React.JSX.Element {
  return (
    <Icon {...props}>
      <path d="M4 15h13l3-4v4" />
      <path d="M6 15V9h7l3 3" />
      <path d="M13 6.5V9" />
      <circle cx="7.5" cy="18" r="2" />
      <circle cx="16.5" cy="18" r="2" />
    </Icon>
  )
}
