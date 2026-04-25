/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.tsx',
    './app/**/*.{ts,tsx}',
    './hooks/**/*.ts',
    './lib/**/*.ts',
    './schemas/**/*.ts',
    './services/**/*.ts',
    './api/**/*.ts',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
