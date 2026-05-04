import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0A',
        accent: '#00FF88',
        card: {
          red: '#FF4444',
          blue: '#2196F3',
          yellow: '#FFC107',
          green: '#4CAF50',
        },
      },
      fontFamily: {
        display: ['"Outfit"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        card: ['"Baloo 2"', '"Nunito"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
