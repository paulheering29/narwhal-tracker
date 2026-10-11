import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'

// ─── Dark mode ────────────────────────────────────────────────────────────────
// The app is styled with Tailwind's stock colours (text-gray-600, bg-red-50, ...).
// Rather than adding dark: variants to every class, each colour becomes a CSS
// variable that holds Tailwind's normal value in light mode and the opposite end of
// the scale in dark mode (red-50 <-> red-950, red-600 <-> red-400). Light mode is
// therefore unchanged. Grays are hand-picked in DARK_GRAY for better contrast.
//
// Text, borders, rings etc. flip at every shade. Backgrounds flip only for the light
// tints (50-300); solid fills (bg-red-600, bg-gray-900) keep their colour so white
// text on them stays readable. bg-white becomes the --surface variable.

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const
const PALETTES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'pink', 'rose'] as const

const DARK_GRAY: Record<string, string> = {
  '50': '#0c111b', '100': '#1f2939', '200': '#2c3749', '300': '#475264', '400': '#7a8598',
  '500': '#949eaf', '600': '#afb7c5', '700': '#c6cdd8', '800': '#dde2ea', '900': '#f1f4f8', '950': '#fafbfd',
}
const SURFACE = { light: '#ffffff', dark: '#161e2c' }

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}
const twPalette = (name: string) => (colors as unknown as Record<string, Record<string, string>>)[name]

// name -> shade -> { light, dark } as "r g b"
const themed: Record<string, Record<string, { light: string; dark: string }>> = {}
for (const name of ['gray', ...PALETTES]) {
  themed[name] = {}
  SHADES.forEach((shade, i) => {
    const light = twPalette(name)[shade]
    const dark = name === 'gray' ? DARK_GRAY[shade] : twPalette(name)[SHADES[SHADES.length - 1 - i]]
    themed[name][shade] = { light: rgb(light), dark: rgb(dark) }
  })
}

const flipped = (onlyLightTints: boolean) =>
  Object.fromEntries(Object.keys(themed).map(name => [name, Object.fromEntries(SHADES.map(shade => [
    shade,
    onlyLightTints && Number(shade) > 300
      ? `rgb(${themed[name][shade].light} / <alpha-value>)`
      : `rgb(var(--c-${name}-${shade}) / <alpha-value>)`,
  ]))]))

const flipEverywhere = flipped(false)
const flipTintsOnly = { ...flipped(true), white: 'rgb(var(--surface) / <alpha-value>)' }

const darkModePlugin = plugin(({ addBase }) => {
  const light: Record<string, string> = { '--surface': rgb(SURFACE.light) }
  const dark: Record<string, string> = { '--surface': rgb(SURFACE.dark) }
  for (const [name, shades] of Object.entries(themed)) {
    for (const [shade, v] of Object.entries(shades)) {
      light[`--c-${name}-${shade}`] = v.light
      dark[`--c-${name}-${shade}`] = v.dark
    }
  }
  addBase({ ':root': light, '.dark': dark })
})

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      textColor: flipEverywhere,
      borderColor: flipEverywhere,
      divideColor: flipEverywhere,
      ringColor: flipEverywhere,
      outlineColor: flipEverywhere,
      placeholderColor: flipEverywhere,
      fill: flipEverywhere,
      stroke: flipEverywhere,
      caretColor: flipEverywhere,
      accentColor: flipEverywhere,
      backgroundColor: flipTintsOnly,
      gradientColorStops: flipTintsOnly,
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [darkModePlugin],
}

export default config
