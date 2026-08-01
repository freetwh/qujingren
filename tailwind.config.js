import tailwindcssAnimate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#7C3AED',
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        background: {
          DEFAULT: '#0F0F1A',
          50: '#1A1A2E',
          100: '#252540',
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.05)',
          hover: 'rgba(255,255,255,0.08)',
        },
        text: {
          primary: '#F5F5F5',
          secondary: '#A0A0B8',
          muted: '#6B6B80',
        },
        success: '#10B981',
        danger: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6',
      },
      fontFamily: {
        sans: ['PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
