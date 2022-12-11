import path from "path"
import { defineConfig } from "vite"
import commonjsExternals from "vite-plugin-commonjs-externals"

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./lib"),
    },
  },

  plugins: [
    commonjsExternals({ "externals": ["fs", "child_process", "path"] }),
  ],

  build: {
    rollupOptions: {},
  },
})
