import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['appwrite'],
  },
  build: {
    commonjsOptions: {
      include: [/appwrite/, /node_modules/],
    },
  },
  resolve: {
    alias: {
      // Fix for json-bigint BigNumber issue
      'bignumber.js': 'bignumber.js/bignumber.js',
    },
  },
})