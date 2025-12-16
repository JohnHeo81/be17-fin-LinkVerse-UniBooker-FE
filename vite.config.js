import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  define: {
    global: 'window', 
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // ✅ 프록시 설정 추가
  server: {
    proxy: {
      '/api': {
        target: 'https://www.unibooker.n-e.kr',  // API Gateway 주소
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'wss://api.unibooker.n-e.kr',  // WebSocket도 프록시
        ws: true,
        changeOrigin: true,
      }
    }
  }
})