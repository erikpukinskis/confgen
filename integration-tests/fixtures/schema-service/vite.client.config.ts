import { resolve } from "node:path"
import dts from "unplugin-dts/vite"
import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: [
      { find: "#gql/client", replacement: resolve("gql/client/index.ts") },
    ],
  },
  plugins: [
    dts({
      tsconfigPath: resolve("tsconfig.client.json"),
    }),
  ],
  build: {
    lib: {
      entry: resolve("client/index.ts"),
      name: "@example/schema-service-client",
      formats: ["es"],
      fileName: "index",
    },
    outDir: "client/dist",
    emptyOutDir: true,
    minify: false,
    target: "node24",
    rolldownOptions: {
      external: ["graphql", "@graphql-typed-document-node/core"],
    },
  },
})
