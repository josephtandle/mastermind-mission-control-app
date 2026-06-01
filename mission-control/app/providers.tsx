'use client'
import { ThemeProvider } from 'next-themes'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      value={{ dark: 'theme-dark', light: 'theme-light', charcoal: 'theme-charcoal', neon: 'theme-neon', velvet: 'theme-velvet', obsidian: 'theme-obsidian' }}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
