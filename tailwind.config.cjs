/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        foreground: '#fafafa',
        card: '#18181b',
        'card-foreground': '#fafafa',
        popover: '#09090b',
        'popover-foreground': '#fafafa',
        primary: '#7c4dff',
        'primary-foreground': '#fafafa',
        secondary: '#27272a',
        'secondary-foreground': '#fafafa',
        muted: '#27272a',
        'muted-foreground': '#a1a1aa',
        accent: '#27272a',
        'accent-foreground': '#fafafa',
        destructive: '#7f1d1d',
        'destructive-foreground': '#fafafa',
        border: '#27272a',
        input: '#27272a',
        ring: '#7c4dff',
      },
      borderRadius: {
        lg: '12px',
        md: '8px',
        sm: '4px',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'sans-serif'],
      },
      keyframes: {
        'brand-spectrum': {
          '0%': { filter: 'hue-rotate(0deg) saturate(1.15)' },
          '100%': { filter: 'hue-rotate(360deg) saturate(1.15)' },
        },
      },
      animation: {
        'brand-spectrum': 'brand-spectrum 14s linear infinite',
      },
    },
  },
  plugins: [],
}
