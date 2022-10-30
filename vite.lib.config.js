import path from "path"
import { defineConfig } from "vite"
import commonjsExternals from "vite-plugin-commonjs-externals"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./lib"),
    },
  },

  plugins: [
    commonjsExternals({
      "externals": ["fs", "child_process", "path"],
    }),
  ],

  build: {
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "lib/index.ts"),
      name: "Confgen",
      fileName: (format) => `lib.${format}.js`,
    },

    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [
        "deep-equal",
        "fs-extra",
        "lodash",
        "merge-objects",
        "semver",
        "yaml",
      ],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          "deep-equal": "deepequal",
          "fs-extra": "fsextra",
          "lodash": "lodash",
          "merge-objects": "mergeobjects",
          "semver": "semver",
          "yaml": "yaml",
        },
      },
    },
  },
})
