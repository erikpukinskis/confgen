import { Configgen, Preset } from "./types"

export const vite: Configgen = (presets, args) => ({
  "yarn:dev:vite": "latest",
  ...(presets.includes("devServer")
    ? {
        "script:start:dev": `vite serve ${args.devServer[0] || ""} --config vite.config.js`,
        "viteConfig:server": {
          server: {
            hmr: {
              port: 443,
            },
          },
        }
      }
    : undefined),
  ...(presets.includes("library")
    ? {
        "script:build:vite": "vite build",
        "file:vite.config.js": buildViteConfig(presets, args),
        "file:package.json": {
          "files": [
            "dist"
          ],
          "main": "./dist/index.umd.js",
          "module": "./dist/index.es.js",
          "exports": {
            ".": {
              "import": "./dist/index.es.js",
              "require": "./dist/index.umd.js"
            }
          },
        }
      }
    : undefined),
  
})

const buildViteConfig = (presets: Preset[], args: Record<Preset,string[]>) => {
  const name = args.library[0]
  if (!name) {
    throw new Error('Library preset requires a global name: npx configgen library:MyLibrary')
  }
  const libraryStuff = presets.includes('library') ? `
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "${name}",
      fileName: (format) => \`index.\${format}.js\`,
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["react"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          react: "React",
        },
      },
    },
  },
  ` : undefined

  const devServerStuff = presets.includes('devServer') ? `
  server: {
    hmr: {
      port: 443,
    },
  },
  ` : undefined

  return `
import path from "path"
import { defineConfig } from "vite"
import macrosPlugin from "vite-plugin-babel-macros"

export default defineConfig({
  ${devServerStuff}
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [macrosPlugin()],
  ${libraryStuff}
})
  `
}