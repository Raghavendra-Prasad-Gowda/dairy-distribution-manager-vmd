/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Safelist brand-color classes so they are never purged even when
  // getBrandColors() returns them as runtime string values from constants.js.
  safelist: [
    'bg-nandini-50',    'text-nandini-700',    'border-nandini-200',    'bg-nandini-500',    'border-nandini-500',    'bg-nandini-700',
    'bg-jersey-50',     'text-jersey-700',     'border-jersey-200',     'bg-jersey-500',     'border-jersey-500',     'bg-jersey-700',
    'bg-gowardhan-50',  'text-gowardhan-700',  'border-gowardhan-200',  'bg-gowardhan-500',  'border-gowardhan-500',  'bg-gowardhan-700',
  ],
  theme: {
    extend: {
      colors: {
        nandini: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        jersey: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
        gowardhan: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
