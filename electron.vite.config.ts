import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    base: './',
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      modulePreload: false,
      rollupOptions: {
        input: resolve('src/renderer/index.html')
      }
    }
  }
})
