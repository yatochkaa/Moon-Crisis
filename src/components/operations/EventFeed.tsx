'use client'

/**
 * Compact event feed in the v0 panel style, bound to the real `GameEventDto`.
 *
 * Kept on the Operations screen because the day/expiry/outcome log is part of
 * the real game state (and is asserted by the e2e suite via `event-log`).
 */

import type { GameEventDto } from '@/application/dto'
import { ScrollIcon } from '@/components/ui/icons'

type Props = {
  events: readonly GameEventDto[]
}

export function EventFeed({ events }: Props): React.JSX.Element {
  return (
    <section
      aria-label="Журнал событий"
      className="flex min-h-0 flex-col rounded-lg border border-border bg-panel"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ScrollIcon size={14} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Журнал событий</h2>
      </div>

      {events.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">Событий пока нет.</p>
      ) : (
        <ol
          data-testid="event-log"
          className="flex-1 space-y-1.5 overflow-y-auto p-3 text-xs"
        >
          {events.map((event) => (
            <li
              key={event.id}
              className="border-l-2 border-border pl-2 leading-tight"
            >
              <span className="font-medium text-foreground">
                День {event.day}: {event.title}
              </span>
              <span className="block text-muted-foreground">{event.description}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
