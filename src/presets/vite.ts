import type { CommandGenerator, Precheck } from "@/commands"
import { type Presets } from "@/presets"
import { type Args } from "@/args"
import type { System } from "@/system"

export const precheck: Precheck = (presets, args) => {
  if (presets.includes("library") && presets.includes("appBuild")) {
    throw new Error(
      'Confgen can only generate EITHER a config for building an app OR a config for building a library, but not both. You included both the "appBuild" and "library" presets.'
    )
  }

  const libraryName = presets.includes("library") ? args.library[0] : undefined

  if (presets.includes("library") && !libraryName) {
    throw new Error(
      "library preset requires a global name: npx configgen library:MyLibrary"
    )
  }
}

export const generator: CommandGenerator = (presets, args, system) => [
  {
    command: "yarn",
    dev: true,
    pkg: "vite",
  },
  ...(presets.includes("node") && args.node.length > 0
    ? ([
        {
          command: "yarn",
          dev: true,
          pkg: "vite-plugin-commonjs-externals",
        },
      ] as const)
    : []),
  ...(presets.includes("macros")
    ? ([
        { command: "yarn", dev: true, pkg: "vite-plugin-babel-macros" },
      ] as const)
    : []),
  ...(presets.includes("devServer")
    ? ([
        {
          command: "script",
          name: `start:${args.devServer[0] || "dev"}`,
          script: `vite serve ${
            args.devServer[0] || "src"
          } --config vite.config.js`,
        },
      ] as const)
    : []),
  ...(presets.includes("library")
    ? ([
        {
          command: "script",
          name: "build:vite",
          script: buildBuildCommand(args),
        },
        {
          command: "file",
          path: "package.json",
          contents: buildDistConfig(),
        },
        {
          command: "file",
          path: buildEntryPointpath(presets),
          merge: "if-not-exists",
          contents: buildDefaultIndex(args),
        },
      ] as const)
    : []),
  ...(presets.includes("sql")
    ? ([
        {
          command: "yarn",
          pkg: "vite-plugin-sql",
          dev: true,
        },
      ] as const)
    : []),
  ...(presets.includes("react")
    ? ([
        {
          command: "yarn",
          pkg: "@vitejs/plugin-react",
          dev: true,
        },
      ] as const)
    : []),
  ...(presets.includes("vitest") && presets.includes("react")
    ? ([
        {
          command: "yarn",
          pkg: "jsdom",
          dev: true,
        },
      ] as const)
    : []),
  {
    command: "file",
    path: "vite.config.js",
    contents: buildViteConfig(presets, args, system),
  },
]

const buildBuildCommand = (args: Args) => {
  const command = "vite build"
  if (args.library[1]) {
    return `${command} --mode ${args.library[1]}`
  } else {
    return command
  }
}

const buildDistConfig = () => ({
  files: ["dist"],
  main: "./dist/index.umd.js",
  module: "./dist/index.es.js",
  exports: {
    ".": {
      import: "./dist/index.es.js",
      require: "./dist/index.umd.js",
    },
  },
})

const buildViteConfig = (presets: Presets, args: Args, system: System) => {
  const libraryName = presets.includes("library") ? args.library[0] : undefined

  const dependencies = getDependencies(system)
  const globals = getGlobals(dependencies)

  const buildStuff = presets.includes("library")
    ? `
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "${buildEntryPointpath(presets)}"),
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
    : presets.includes("appBuild")
    ? `
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src", "index.html"),
      },
    },
  },
    `
    : ""

  const apiStuff =
    presets.includes("api") && presets.includes("devServer")
      ? `
    proxy: {
      '/graphql': 'http://localhost:3001',
    },
  `
      : ""

  const devServerStuff = presets.includes("devServer")
    ? `
  server: {
    hmr: {
      port: 443,
    },
    ${apiStuff}
  },
  `
    : ""

  const jsdomStuff =
    presets.includes("vitest") && presets.includes("react")
      ? `
  test: {
    environment: "jsdom",
  },
  `
      : ""

  const plugins: VitePlugin[] = []

  if (presets.includes("macros") || presets.includes("sql")) {
    plugins.push(["macros", "vite-plugin-babel-macros"])
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

  if (presets.includes("sql")) {
    plugins.push(["sql", "vite-plugin-sql"])
  }

  if (presets.includes("react")) {
    plugins.push(["react", "@vitejs/plugin-react"])
  }

  return `
import path from "path"
import { defineConfig } from "vite"
${pluginImports(plugins)}

export default defineConfig({
  ${devServerStuff}
  ${jsdomStuff}
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  ${pluginConfig(plugins)}
  ${buildStuff}
})
  `
}

const getDependencies = (system: System) => {
  const source = system.read("package.json")
  const json = JSON.parse(source) as { dependencies?: Record<string, string> }
  if (!json.dependencies) return []
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

type VitePlugin = [string, string] | [string, string, Record<string, unknown>]

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
  .join(",\n")}
  ],

`

const buildEntryPointpath = (presets: Presets) =>
  `src/index.${presets.includes("typescript") ? "ts" : "js"}`

const buildDefaultIndex = (args: Args) => `
export const ${args.library[0] || "MyLib"} = () => "hello, world!"
`
