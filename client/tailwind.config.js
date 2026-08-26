/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Safelist brand-color classes so they are never purged even when
  // getBrandColors() returns them as runtime string values from constants.js.
  safelist: [
    'bg-nandini-50',    'text-nandini-700',    'border-nandini-200',    'bg-nandini-500',    'border-nandini-500',    'bg-nandini-700',
    'bg-jersey-50',     'text-jersey-700',     'border-jersey-200',     'bg-jersey-500',     'border-jersey-500',     'bg-jersey-700',
    'bg-gowardhan-50',  'text-gowardhan-700',  'border-gowardhan-200',  'bg-gowardhan-500',  'border-gowardhan-500',  'bg-gowardhan-600',
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
        // Redefined from the original emerald/teal palette to purple — it read
        // too close to Jersey's teal-leaning blue (bg-jersey-700, #0369a1) to
        // reliably tell apart, failing the dataviz skill's CVD checker's
        // normal-vision floor. Standard Tailwind purple values, so every
        // existing bg-gowardhan-*/text-gowardhan-*/border-gowardhan-* usage
        // (Dairy Settings brand dot, sidebar nav dot, BrandTabs, Stock
        // Summary header) stays on ONE color family instead of diverging.
        gowardhan: {
          50:  '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
