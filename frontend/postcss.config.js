// PostCSS configuration: runs Tailwind CSS (generates utility classes from
// tailwind.config.js) followed by Autoprefixer (adds vendor prefixes for
// cross-browser CSS compatibility) as part of the Vite build pipeline.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
