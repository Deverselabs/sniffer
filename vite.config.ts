import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const etherscanKey = env.VITE_ETHERSCAN_API_KEY || env.ETHERSCAN_API_KEY || process.env.ETHERSCAN_API_KEY || ""

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_ETHERSCAN_API_KEY": JSON.stringify(etherscanKey),
    },
    build: {
      outDir: 'dist',
    },
  }
})
