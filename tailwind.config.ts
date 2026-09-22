import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#07090f',
          900: '#0b0e16',
          850: '#0f131d',
          800: '#141926',
          750: '#1a2030',
          700: '#222a3d',
        },
        ink: {
          100: '#eef2fb',
          200: '#cfd7ea',
          300: '#a7b1c9',
          400: '#7d879e',
          500: '#5b6478',
        },
        accent: {
          DEFAULT: '#5b8cff',
          soft: '#7ea6ff',
          dim: '#2b4a8f',
        },
        mint: '#48d6a5',
        amber: '#f0b45f',
        rose: '#f2607a',
        violet: '#a479ff',
      },
      fontFamily: {
        sans: ['Inter var', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 18px 44px -26px rgba(0,0,0,0.95)',
        raised: '0 24px 60px -30px rgba(0,0,0,1)',
        glow: '0 0 0 1px rgba(91,140,255,0.35), 0 0 28px -6px rgba(91,140,255,0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(72,214,165,0.5)' },
          '70%': { boxShadow: '0 0 0 6px rgba(72,214,165,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(72,214,165,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'slide-up': 'slide-up 220ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-down': 'slide-down 160ms cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
