import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // Connection Map brand palette
        // NOTE: These stay as hex (not CSS vars) because Tailwind opacity
        // modifiers like bg-cm-purple/15 need raw color values.
        // Theme tokens are mirrored as CSS custom properties in globals.css
        // (:root / .theme-dark) for use in non-Tailwind CSS rules.
        cm: {
          dark:         '#151515',
          cream:        '#FCF4EB',
          'cream-soft': '#FAF8F5',
          purple:       '#7C69C7',
          'purple-mid': '#B8ABE4',
          'purple-light':'#EEE9F8',
          pink:         '#F5C3C6',
          'pink-light': '#FBE9EA',
        },
        // Dark navy theme — uses RGB channel vars so opacity modifiers work
        // (e.g. bg-dark-panel/60) while still responding to theme switching.
        dark: {
          bg:      'rgb(var(--color-bg-rgb) / <alpha-value>)',
          sidebar: 'rgb(var(--color-sidebar-rgb) / <alpha-value>)',
          panel:   'rgb(var(--color-panel-rgb) / <alpha-value>)',
          panel2:  'rgb(var(--color-panel2-rgb) / <alpha-value>)',
          border:  'var(--color-border)',
          text:    'rgb(var(--color-text-rgb) / <alpha-value>)',
          muted:   'rgb(var(--color-muted-rgb) / <alpha-value>)',
          success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
          warn:    'rgb(var(--color-warn-rgb) / <alpha-value>)',
          danger:  'rgb(var(--color-danger-rgb) / <alpha-value>)',
        },
        purple2: '#9d8de0',
      },
      fontFamily: {
        'dm-sans': ['"DM Sans"', 'sans-serif'],
        'dm-mono': ['"DM Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
