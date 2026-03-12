import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        hedera: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc8fc',
          400: '#36adf8',
          500: '#0c93e9',
          600: '#0074c7',
          700: '#015ca1',
          800: '#064f85',
          900: '#0b426e',
        },
      },
    },
  },
  plugins: [],
};

export default config;
