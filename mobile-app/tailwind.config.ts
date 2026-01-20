import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#1e1e1e',
          text: '#d4d4d4',
          green: '#4ec9b0',
          yellow: '#dcdcaa',
          blue: '#569cd6',
          red: '#f44747',
          cyan: '#9cdcfe',
          magenta: '#c586c0',
        },
      },
    },
  },
  plugins: [],
}
export default config
