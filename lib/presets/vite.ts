import type {
  Precheck,
  CommandGenerator,
  Presets,
  Args,
  System,
  Runtimes,
  CommandWithArgs,
} from "@/commands"
import type { Runtime } from "@/runtimes"
import merge from "lodash/merge"

export const precheck: Precheck = ({ args }) => {
  if (args.dist.includes("lib") && !args.global.name) {
    throw new Error(
      "In order to build a library with the dist:lib preset, you need to provide a variable name for the built UMD global.\n\nTry confgen @lib --name MyPackage dist:lib\n"
    )
  }
}

export const generator: CommandGenerator = ({
  runtimes,
  presets,
  args,
  system,
}) => {
  const commands: CommandWithArgs[] = [
    {
      command: "yarn",
      dev: true,
      pkg: "vite",
    },
  ]

  // Commands for presets:

  if (presets.includes("node") && args.node.length > 0) {
    commands.push({
      command: "yarn",
      dev: true,
      pkg: "vite-plugin-commonjs-externals",
    })
  }

  if (presets.includes("macros")) {
    commands.push({
      command: "yarn",
      dev: true,
      pkg: "vite-plugin-babel-macros",
    })
  }

  if (presets.includes("sql")) {
    commands.push({
      command: "yarn",
      pkg: "vite-plugin-sql",
      dev: true,
    })
  }

  if (presets.includes("react")) {
    commands.push({
      command: "yarn",
      pkg: "@vitejs/plugin-react",
      dev: true,
    })
  }

  if (presets.includes("vitest") && presets.includes("react")) {
    commands.push({
      command: "yarn",
      pkg: "jsdom",
      dev: true,
    })
  }

  // Commands for runtimes:

  if (runtimes.includes("app")) {
    commands.push(...getAppCommands(runtimes, presets, args, system))
  }

  if (args.dist.includes("lib")) {
    commands.push(...getLibCommands(runtimes, presets, args, system))
  }

  if (runtimes.includes("docs")) {
    commands.push(...getDocsCommands(runtimes, presets, system))
  }

  return commands
}

const getLibCommands = (
  runtimes: Runtimes,
  presets: Presets,
  args: Args,
  system: System
): CommandWithArgs[] => [
  {
    command: "script",
    name: "build:lib",
    script: "vite build --config vite.lib.config.js --mode development",
  },
  {
    command: "file",
    path: "package.json",
    contents: getDistConfig(),
  },
  {
    command: "file",
    path: "vite.lib.config.js",
    contents: getViteLibConfig(runtimes, presets, args, system),
  },
]

const getAppCommands = (
  runtimes: Runtimes,
  presets: Presets,
  args: Args,
  system: System
) => {
  const commands: CommandWithArgs[] = [
    {
      command: "script",
      name: `start:app:dev`,
      script: `vite serve app --config vite.app.config.js`,
    },
    {
      command: "file",
      path: "vite.app.config.js",
      contents: getViteAppConfig(runtimes, presets, args, system),
    },
  ]

  if (args.dist.includes("app")) {
    commands.push({
      command: "script",
      name: "build:app",
      script: "vite build --config vite.app.config.js --mode development",
    })
  }

  return commands
}

const getDocsCommands = (
  runtimes: Runtimes,
  presets: Presets,
  system: System
): CommandWithArgs[] => [
  {
    command: "script",
    name: `start:docs:dev`,
    script: `vite serve docs --config vite.docs.config.js`,
  },
  {
    command: "file",
    path: "vite.docs.config.js",
    contents: getViteDocsConfig(runtimes, presets, system),
  },
  {
    command: "script",
    name: "build:docs",
    script: "vite build --config vite.docs.config.js --mode development",
  },
]

const getDistConfig = () => ({
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

const getViteAppConfig = (
  runtimes: Runtimes,
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

  const buildStuff = args.dist.includes("app")
    ? `
    emptyOutDir: false,
    assetsDir: 'app',
  `
    : ""

  const apiStuff = runtimes.includes("server")
    ? `
    proxy: {
      '/server': 'http://localhost:3001',
    },
  `
    : ""

  const shouldConfigureHmr = presets.includes("codespaces")

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

  return getViteConfig(runtimes, presets, system, [], "app", {
    buildStuff,
    serverStuff,
    codespaceSetup,
    rollupStuff,
  })
}

const getViteDocsConfig = (
  runtimes: Runtimes,
  presets: Presets,
  system: System
) => {
  const rollupStuff = `
      input: {
        main: path.resolve(__dirname, "docs", "index.html"),
      },
    `

  const shouldConfigureHmr = presets.includes("codespaces")

  const codespaceSetup = shouldConfigureHmr
    ? `const inCodespace = Boolean(process.env.GITHUB_CODESPACE_TOKEN)`
    : ""

  const serverStuff = shouldConfigureHmr
    ? `
    ...(inCodespace ? {
      hmr: {
        port: 443,
      },
    } : {}),
  `
    : ""

  const buildStuff = `
    emptyOutDir: false,
    assetsDir: 'docs',
  `

  return getViteConfig(runtimes, presets, system, [], "docs", {
    buildStuff,
    serverStuff,
    codespaceSetup,
    rollupStuff,
  })
}

const getViteLibConfig = (
  runtimes: Runtimes,
  presets: Presets,
  args: Args,
  system: System
) => {
  const buildStuff = `
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, "${getLibEntryPointpath(presets)}"),
      name: "${args.global.name}",
      fileName: (format) => \`lib.\${format}.js\`,
    },
  `

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

  return getViteConfig(runtimes, presets, system, plugins, "lib", {
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

const getViteConfig = (
  runtimes: Runtimes,
  presets: Presets,
  system: System,
  plugins: VitePlugin[],
  runtime: Runtime,
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
      "@": path.resolve(__dirname, "./${runtimes[0]}"),
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

const getLibEntryPointpath = (presets: Presets) =>
  `lib/index.${presets.includes("typescript") ? "ts" : "js"}`
