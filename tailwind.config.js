/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./popup.html",
    "./popup.js"
  ],
  theme: {
    extend: {
      // We are extending the theme with X's official colors and fonts
      colors: {
        'x-blue': '#1DA1F2', // The iconic blue for primary buttons
        'x-bg': '#000000',     // The pure black background of the X interface
        'x-border': '#2f3336', // The subtle border color used on X
        'x-text-primary': '#e7e9ea', // The primary off-white text color
        'x-text-secondary': '#71767b', // The gray color for secondary text
      },
      fontFamily: {
        // This uses the best system font available for a clean, native feel
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
