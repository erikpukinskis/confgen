import dts from "unplugin-dts/vite"
import { defineConfig } from "vite"
import { resolve } from "node:path"

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve("tsconfig.json"),
      bundleTypes: true,
      include: ["lib/**/*.ts", "gql/**/*.ts", "server/**/*.ts"],
      exclude: ["**/*.test.ts", "gql/client/**"],
    }),
  ],
  build: {
    ssr: true,
    lib: {
      entry: {
        index: resolve("lib/index.ts"),
        "test-kit": resolve("lib/test-kit.ts"),
      },
      name: "@example/schema-service",
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    outDir: "dist/lib",
    emptyOutDir: true,
    minify: false,
    target: "node24",
    rolldownOptions: {
      output: { entryFileNames: "[name].js" },
    },
  },
})
