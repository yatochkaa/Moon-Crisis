import { GameScreen } from '@/components/GameScreen'

/**
 * The page itself is a server component without business logic: the interactive
 * game screen is a client component that talks to the Route Handlers.
 *
 * The app fills the whole viewport (100vw x 100dvh) over a starfield backdrop.
 * The map inside the game screen is the primary element; nothing scrolls at the
 * page level.
 */
export default function HomePage(): React.JSX.Element {
  return (
    <main className="mcc-space h-[100dvh] w-screen overflow-hidden">
      <h1 className="sr-only">Moon Courier Crisis — Операции</h1>
      <GameScreen />
    </main>
  )
}
