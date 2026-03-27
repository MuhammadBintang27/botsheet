import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        mist: '#e2e8f0',
        accent: '#22c55e',
        danger: '#ef4444'
      },
      fontFamily: {
        display: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
