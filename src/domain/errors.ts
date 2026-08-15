/**
 * Domain-level invariant violation.
 *
 * This error means that data reaching the domain layer was already invalid
 * (for example a rover with zero efficiency). It is a programming/data bug,
 * never a normal user-facing outcome, so the presentation layer maps it to a
 * generic internal error.
 */
export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainInvariantError'
  }
}

export function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DomainInvariantError(`${label} must be a positive finite number`)
  }
}

export function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new DomainInvariantError(`${label} must be a finite number`)
  }
}
