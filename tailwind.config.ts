import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0F1419',
          panel: '#161D26',
          raised: '#1C242F',
          line: '#26313D',
          faint: '#1A2129',
        },
        text: {
          primary: '#E8EDF2',
          muted: '#7C8B9B',
          dim: '#4B5A69',
        },
        signal: {
          DEFAULT: '#E8A33D',
          dim: '#7A5A28',
          glow: '#F5C878',
        },
        ok: '#4FB286',
        warn: '#E2B94F',
        danger: '#E2604F',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(232,163,61,0.4), 0 0 24px -4px rgba(232,163,61,0.35)',
      },
      backgroundImage: {
        blueprint:
          'linear-gradient(rgba(38,49,61,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(38,49,61,0.5) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '28px 28px',
      },
    },
  },
  plugins: [],
};

export default config;
