import type { Config } from 'tailwindcss'

/**
 * Semantic colour names come from the v0 visual reference. The values are CSS
 * variables declared in `src/app/globals.css`, wrapped in `color-mix` so that
 * Tailwind opacity modifiers (`bg-primary/15`, `border-danger/40`) keep working
 * on Tailwind v3 with `oklch()` variables.
 */
function token(name: string): string {
  return `color-mix(in oklab, var(${name}) calc(<alpha-value> * 100%), transparent)`
}

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: token('--background'),
        foreground: token('--foreground'),
        panel: token('--panel'),
        card: token('--card'),
        primary: {
          DEFAULT: token('--primary'),
          foreground: token('--primary-foreground'),
        },
        secondary: token('--secondary'),
        muted: {
          DEFAULT: token('--muted'),
          foreground: token('--muted-foreground'),
        },
        border: token('--border'),
        ring: token('--ring'),
        route: token('--route'),
        success: token('--success'),
        danger: token('--danger'),
        contract: token('--contract'),
        'moon-surface': token('--moon-surface'),
        'moon-surface-2': token('--moon-surface-2'),
      },
      borderColor: {
        DEFAULT: token('--border'),
      },
      borderRadius: {
        sm: 'calc(var(--radius) * 0.6)',
        md: 'calc(var(--radius) * 0.8)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) * 1.4)',
      },
    },
  },
  plugins: [],
}

export default config
