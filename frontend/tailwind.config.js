/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0F19',
        primary: '#3F8CFF',
        secondary: '#1A2130',
        textPrimary: '#F3F4F6',
        textSecondary: '#9CA3AF'
      }
    },
  },
  plugins: [],
}
