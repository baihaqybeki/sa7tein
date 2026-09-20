/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}', '../../packages/shared/src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        go: {
          50: '#fef2ef',
          100: '#fde3dc',
          200: '#fbc8ba',
          300: '#f7a38b',
          400: '#f17451',
          500: '#e04020',
          600: '#c93316',
          700: '#a72b15',
          800: '#8b2618',
          900: '#732217',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
