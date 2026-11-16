import { resolve } from "node:path"
import dts from "unplugin-dts/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve("tsconfig.json"),
      bundleTypes: true,
      include: ["lib/test.ts", "gql/**/*.ts", "server/queries/**/*.ts"],
      exclude: ["**/*.test.ts", "gql/client/**"],
    }),
  ],
  build: {
    lib: {
      entry: resolve("lib/test.ts"),
      name: "@example/schema-service-test",
      formats: ["es"],
      fileName: "index",
    },
    outDir: "dist/test",
    emptyOutDir: true,
    minify: false,
    target: "node24",
    rolldownOptions: {
      external: (id: string) =>
        !(
          id.startsWith(".") ||
          id.startsWith("#") ||
          id.startsWith("\0") ||
          (id.startsWith("/") &&
            !id.includes("/.yarn/") &&
            !id.includes("/node_modules/"))
        ),
    },
  },
})
