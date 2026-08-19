import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 只允许这些非敏感配置进入前端。即使本机 .env 中存在 VITE_* 密钥，Vite 也不会暴露它们。
  envPrefix: ['VITE_OCR_PROVIDER', 'VITE_REMOTE_API_URL', 'VITE_SUPABASE_URL'],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    strictPort: true,
  },
})
