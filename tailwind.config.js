/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F6F0',
        surface: '#FFFFFF',
        ink: '#1F2A24',
        crate: {
          50: '#EAF3EC',
          100: '#CFE4D5',
          300: '#6FA989',
          500: '#1B6B4A',
          700: '#124D35',
          900: '#0B3324',
        },
        marigold: {
          100: '#FCEFD6',
          300: '#F0C57A',
          500: '#E8A33D',
          700: '#B87A22',
        },
        brick: {
          100: '#F6E2DE',
          500: '#C0463A',
          700: '#902F26',
        },
        line: '#E2E4DD',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
