import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  appType: "custom",
  publicDir: false,
  build: {
    ssr: resolve("server/index.ts"),
    outDir: "dist/server",
    emptyOutDir: true,
    minify: false,
    target: "node24",
    rolldownOptions: {
      output: { format: "es", entryFileNames: "index.mjs" },
    },
  },
})
