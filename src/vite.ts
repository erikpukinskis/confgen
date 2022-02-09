import { Configgen, Preset } from "./types"
import { readFileSync } from "fs"

export const vite: Configgen = (presets, args) => ({
  "yarn:dev:vite": "*",
  ...(presets.includes("node") && args.node.length > 0
    ? { "yarn:dev:vite-plugin-commonjs-externals": "*" }
    : undefined),
  ...(presets.includes("emotion")
    ? { "yarn:dev:vite-plugin-babel-macros": "*" }
    : undefined),
  ...(presets.includes("devServer")
    ? {
        "script:start:dev": `vite serve ${
          args.devServer[0] || ""
        } --config vite.config.js`,
      }
    : undefined),
  ...(presets.includes("library")
    ? {
        "script:build:vite": "vite build",
        "file:package.json": {
          "files": ["dist"],
          "main": "./dist/index.umd.js",
          "module": "./dist/index.es.js",
          "exports": {
            ".": {
              "import": "./dist/index.es.js",
              "require": "./dist/index.umd.js",
            },
          },
        },
      }
    : undefined),
  "file:vite.config.js": buildViteConfig(presets, args),
})

const buildViteConfig = (presets: Preset[], args: Record<Preset, string[]>) => {
  const libraryName = presets.includes("library") ? args.library[0] : undefined
  if (presets.includes("library") && !libraryName) {
    throw new Error(
      "library preset requires a global name: npx configgen library:MyLibrary"
    )
  }
  const dependencies = getDependencies()
  const globals = getGlobals(dependencies)
  const libraryStuff = presets.includes("library")
    ? `
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "${libraryName}",
      fileName: (format) => \`index.\${format}.js\`,
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ${JSON.stringify(dependencies)},
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: ${JSON.stringify(globals, null, 10)},
      },
    },
  },
  `
    : ""

  const devServerStuff = presets.includes("devServer")
    ? `
  server: {
    hmr: {
      port: 443,
    },
  },
  `
    : ""

  const plugins: VitePlugin[] = []
  if (presets.includes("emotion")) {
    plugins.push(["macrosPlugin", "vite-plugin-babel-macros"])
  }

  if (presets.includes("node") && args.node.length > 0) {
    plugins.push([
      "commonjsExternals",
      "vite-plugin-commonjs-externals",
      {
        externals: args.node,
      },
    ])
  }

  return `
import path from "path"
import { defineConfig } from "vite"
${pluginImports(plugins)}

export default defineConfig({
  ${devServerStuff}
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  ${pluginConfig(plugins)}
  ${libraryStuff}
})
  `
}

const getDependencies = () => {
  const source = readFileSync("package.json").toString()
  const json = JSON.parse(source)
  return Object.keys(json["dependencies"])
}

const getGlobals = (dependencies: string[]) =>
  dependencies.reduce(
    (globals, dependency) => ({
      ...globals,
      [dependency]: dependency.replace(/[^a-z]/gi, ""),
    }),
    {} as Record<string, string>
  )

type VitePlugin = [string, string, any?]

const pluginImports = (plugins: VitePlugin[]) => {
  return plugins
    .map(([variable, pkg]) => `import ${variable} from "${pkg}"`)
    .join("\n")
}

const pluginConfig = (plugins: VitePlugin[]) => `
  plugins: [
${plugins
  .map(
    ([variable, , config]) =>
      `${variable}(${config ? JSON.stringify(config, null, 4) : ""})`
  )
  .join("\n")}
  ],

`
