/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // 👈 O mais importante
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
