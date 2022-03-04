
import path from "path"
import { defineConfig } from "vite"
import commonjsExternals from "vite-plugin-commonjs-externals"

export default defineConfig({
  
  
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  
  plugins: [
commonjsExternals({
    "externals": [
        "fs",
        "child_process",
        "path"
    ]
})
  ],


  
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "Confgen",
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["fs-extra","lodash","merge-objects","yaml"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          "fs-extra": "fsextra",
          "lodash": "lodash",
          "merge-objects": "mergeobjects",
          "yaml": "yaml"
},
      },
    },
  },
  
})
  