// Tailwind CSS configuration for the frontend. Tells Tailwind which files to
// scan for class names (so it can generate only the CSS actually used) and
// extends the default theme with a custom "brand" blue color palette.
/** @type {import('tailwindcss').Config} */
export default {
  // Tailwind statically scans these paths for class names at build time —
  // if a file isn't listed here, classes used only in it may get purged.
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Custom brand shades layered on top of (not replacing) Tailwind's
        // default palette, available as e.g. `bg-brand-600`.
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};
