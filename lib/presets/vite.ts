import type {
  Precheck,
  CommandGenerator,
  Presets,
  Args,
  System,
  Builds,
} from "@/commands"
import type { Build } from "@/builds"
import merge from "lodash/merge"

export const precheck: Precheck = ({ args }) => {
  if (args.dist.includes("lib") && !args.global.name) {
    throw new Error(
      "In order to build a library with the dist:lib preset, you need to provide a variable name for the built UMD global.\n\nTry confgen @lib --name MyPackage dist:lib\n"
    )
  }
}

export const generator: CommandGenerator = ({
  builds,
  presets,
  args,
  system,
}) => [
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
  ...(builds.includes("app")
    ? ([
        {
          command: "script",
          name: `start:app:dev`,
          script: `vite serve app --config vite.app.config.js`,
        },
      ] as const)
    : []),
  ...(args.dist.includes("lib")
    ? ([
        {
          command: "script",
          name: "build:lib",
          script: "vite build --config vite.lib.config.js --mode development",
        },
        {
          command: "file",
          path: "package.json",
          contents: buildDistConfig(),
        },
        {
          command: "file",
          path: "vite.lib.config.js",
          contents: buildViteLibConfig(builds, presets, args, system),
        },
      ] as const)
    : []),
  ...(builds.includes("app")
    ? ([
        {
          command: "script",
          name: "build:app",
          script: "vite build --config vite.app.config.js --mode development",
        },
        {
          command: "file",
          path: "vite.app.config.js",
          contents: buildViteAppConfig(builds, presets, args, system),
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
]

const buildDistConfig = () => ({
  files: ["dist"],
  main: "./dist/lib.umd.js",
  module: "./dist/lib.es.js",
  exports: {
    ".": {
      import: "./dist/lib.es.js",
      require: "./dist/lib.umd.js",
    },
  },
})

const buildViteAppConfig = (
  builds: Builds,
  presets: Presets,
  args: Args,
  system: System
) => {
  const rollupStuff = args.dist.includes("app")
    ? `
      input: {
        main: path.resolve(__dirname, "app", "index.html"),
      },
    `
    : ""

  const apiStuff = builds.includes("server")
    ? `
    proxy: {
      '/server': 'http://localhost:3001',
    },
  `
    : ""

  const shouldConfigureHmr =
    builds.includes("app") && presets.includes("codespaces")

  const codespaceSetup = shouldConfigureHmr
    ? `const inCodespace = Boolean(process.env.GITHUB_CODESPACE_TOKEN)`
    : ""

  const codespaceStuff = shouldConfigureHmr
    ? `
    ...(inCodespace ? {
      hmr: {
        port: 443,
      },
    } : {}),
  `
    : ""
  const serverStuff =
    codespaceStuff || apiStuff
      ? `
  server: {
    ${apiStuff}
    ${codespaceStuff}
  },
`
      : ""

  return buildViteConfig(builds, presets, system, [], "app", {
    serverStuff,
    codespaceSetup,
    rollupStuff,
  })
}

const buildViteLibConfig = (
  builds: Builds,
  presets: Presets,
  args: Args,
  system: System
) => {
  let buildStuff = `
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "${buildLibEntryPointpath(presets)}"),
      name: "${args.global.name}",
      fileName: (format) => \`lib.\${format}.js\`,
    },
  `

  if (args.dist.includes("app")) {
    buildStuff += `
    emptyOutDir: false,
  `
  }

  const plugins: VitePlugin[] = []

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

  const dependencies = getDependencies(system)

  const globals = getGlobals(dependencies)

  const rollupStuff = `
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ${JSON.stringify(dependencies)},
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: ${JSON.stringify(globals, null, 10)},
      },
  `

  return buildViteConfig(builds, presets, system, plugins, "lib", {
    buildStuff,
    rollupStuff,
  })
}

type Scripts = {
  codespaceSetup?: string
  serverStuff?: string
  buildStuff?: string
  rollupStuff?: string
}

const buildViteConfig = (
  builds: Builds,
  presets: Presets,
  system: System,
  plugins: VitePlugin[],
  build: Build,
  scripts: Scripts
) => {
  const {
    codespaceSetup = "",
    serverStuff = "",
    buildStuff = "",
    rollupStuff = "",
  } = scripts

  const jsdomStuff =
    presets.includes("vitest") && presets.includes("react")
      ? `
  test: {
    environment: "jsdom",
  },
  `
      : ""

  if (presets.includes("macros") || presets.includes("sql")) {
    plugins.push(["macros", "vite-plugin-babel-macros"])
  }

  if (presets.includes("react")) {
    plugins.push(["react", "@vitejs/plugin-react"])
  }

  return `
import path from "path"
import { defineConfig } from "vite"
${pluginImports(plugins)}

${codespaceSetup}

export default defineConfig({
  ${serverStuff}
  ${jsdomStuff}
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./${builds[0]}"),
    },
  },
  ${pluginConfig(plugins)}
  build: {
    ${buildStuff}
    rollupOptions: {
      ${rollupStuff}
    }
  }
})
`
}

const getDependencies = (system: System) => {
  if (!system.exists("package.json")) return []
  const source = system.read("package.json")

  const json = JSON.parse(source) as {
    dependencies: Record<string, string>
    peerDependencies: Record<string, string>
  }

  return Object.keys(merge(json.dependencies, json.peerDependencies))
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

const buildLibEntryPointpath = (presets: Presets) =>
  `lib/index.${presets.includes("typescript") ? "ts" : "js"}`
