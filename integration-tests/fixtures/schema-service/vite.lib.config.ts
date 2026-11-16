import { resolve } from "node:path"
import dts from "unplugin-dts/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve("tsconfig.json"),
      bundleTypes: true,
      include: ["lib/**/*.ts"],
      exclude: ["**/*.test.ts", "lib/test.ts"],
    }),
  ],
  build: {
    lib: {
      entry: resolve("lib/index.ts"),
      name: "@example/schema-service",
      formats: ["es"],
      fileName: "index",
    },
    outDir: "dist/lib",
    emptyOutDir: true,
    minify: false,
    target: "node24",
  },
})
