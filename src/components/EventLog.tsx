import type { GameEventDto } from '@/application/dto'

type Props = {
  events: readonly GameEventDto[]
}

export function EventLog({ events }: Props): React.JSX.Element {
  return (
    <section
      aria-label="Журнал событий"
      className="rounded border border-slate-700 p-3"
    >
      <h2 className="mb-2 font-semibold">Журнал событий</h2>
      {events.length === 0 ? (
        <p className="text-sm text-slate-400">Событий пока нет.</p>
      ) : (
        <ol data-testid="event-log" className="flex flex-col gap-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="border-l-2 border-slate-600 pl-2">
              <span className="font-semibold">
                День {event.day}: {event.title}
              </span>
              <span className="block text-slate-300">{event.description}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
