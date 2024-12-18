import merge from "lodash/merge"
import type {
  Precheck,
  CommandGenerator,
  Presets,
  Args,
  System,
  Runtimes,
  CommandWithArgs,
} from "~/commands"
import { formatTypescript } from "~/format"

export const precheck: Precheck = ({ args }) => {
  if (args.dist.includes("lib") && !args.global.name) {
    throw new Error(
      "In order to build a library with the dist:lib preset, you need to provide a variable name for the built UMD global.\n\nTry confgen @lib --name MyPackage dist:lib\n"
    )
  }
}

export const generator: CommandGenerator = async ({
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

  // Write configs:

  if (runtimes.includes("app")) {
    commands.push(...(await getAppCommands(runtimes, presets, args)))
  }

  if (presets.includes("vitest")) {
    commands.push(...(await getTestCommands(runtimes, presets, args)))
  }

  if (args.dist.includes("lib")) {
    commands.push(...(await getLibCommands(runtimes, presets, args, system)))
  }

  if (runtimes.includes("docs")) {
    commands.push(...(await getDocsCommands(runtimes, presets)))
  }

  return commands
}

const getTestCommands = async (
  runtimes: Runtimes,
  presets: Presets,
  args: Args
) =>
  [
    {
      command: "file",
      path: "vite.test.config.js",
      contents: await getViteTestConfig(runtimes, presets, args),
    },
  ] as const

const getLibCommands = async (
  runtimes: Runtimes,
  presets: Presets,
  args: Args,
  system: System
) => {
  const commands: CommandWithArgs[] = [
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
      contents: await getViteLibConfig(runtimes, presets, args, system),
    },
  ]
  return commands
}

const getAppCommands = async (
  runtimes: Runtimes,
  presets: Presets,
  args: Args
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
      contents: await getViteAppConfig(runtimes, presets, args),
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

const getDocsCommands = async (runtimes: Runtimes, presets: Presets) => {
  const commands: CommandWithArgs[] = [
    {
      command: "script",
      name: `start:docs:dev`,
      script: `vite serve docs --config vite.docs.config.js`,
    },
    {
      command: "file",
      path: "vite.docs.config.js",
      contents: await getViteDocsConfig(runtimes, presets),
    },
    {
      command: "script",
      name: "build:docs",
      script:
        "vite build --config vite.docs.config.js --mode development && mv site/docs/index.html site && rmdir site/docs && cp site/index.html site/404.html",
    },
  ]

  return commands
}

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

const getViteAppConfig = async (
  runtimes: Runtimes,
  presets: Presets,
  args: Args
) => {
  const rollupStuff = args.dist.includes("app")
    ? `
      input: path.resolve(__dirname, "app", "index.html"),
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

  return await getViteConfig(runtimes, presets, [], {
    buildStuff,
    serverStuff,
    codespaceSetup,
    rollupStuff,
  })
}

const getViteDocsConfig = async (runtimes: Runtimes, presets: Presets) => {
  const rollupStuff = `
      input: path.resolve(__dirname, "docs", "index.html"),
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
    outDir: 'site',
    assetsDir: './',
  `

  return await getViteConfig(runtimes, presets, [], {
    buildStuff,
    serverStuff,
    codespaceSetup,
    rollupStuff,
  })
}

const getViteLibConfig = async (
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

  const dependencies = getDependencies(system)

  const globals = getGlobals(dependencies)

  const rollupStuff = `
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ${JSON.stringify(dependencies)},
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: ${JSON.stringify(globals)},
      },
  `

  return getViteBaseConfig(runtimes, presets, args, { buildStuff, rollupStuff })
}

const getViteTestConfig = async (
  runtimes: Runtimes,
  presets: Presets,
  args: Args
) => {
  let testEnvironment: string | undefined

  if (presets.includes("vitest") && presets.includes("react")) {
    testEnvironment = "jsdom"
  }

  const setupFiles = []

  if (presets.includes("dotenv")) {
    setupFiles.push("dotenv/config")
  }

  const testStuff = (() => {
    if (!testEnvironment && setupFiles.length < 1) {
      return ""
    }

    return `
        test: {
          ${
            testEnvironment
              ? `environment: ${JSON.stringify(testEnvironment)},`
              : ""
          }
          ${
            setupFiles.length > 0
              ? `setupFiles: ${JSON.stringify(setupFiles)},`
              : ""
          }
        },
      `
  })()

  return getViteBaseConfig(runtimes, presets, args, {
    testStuff,
  })
}

const getViteBaseConfig = async (
  runtimes: Runtimes,
  presets: Presets,
  args: Args,
  scripts: Partial<Scripts> = {}
) => {
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

  return await getViteConfig(runtimes, presets, plugins, scripts)
}

type Scripts = {
  codespaceSetup: string
  serverStuff: string
  buildStuff: string
  rollupStuff: string
  testStuff: string
}

const getViteConfig = async (
  runtimes: Runtimes,
  presets: Presets,
  plugins: VitePlugin[],
  scripts: Partial<Scripts>
) => {
  const {
    codespaceSetup = "",
    serverStuff = "",
    buildStuff = "",
    rollupStuff = "",
    testStuff = "",
  } = scripts

  if (presets.includes("macros") || presets.includes("sql")) {
    plugins.push(["macros", "vite-plugin-babel-macros"])
  }

  if (presets.includes("react")) {
    plugins.push(["react", "@vitejs/plugin-react"])
  }

  const source = `
    import path from "path"
    import { defineConfig } from "vite"
    ${pluginImports(plugins)}

    ${codespaceSetup}

    export default defineConfig({
      ${serverStuff}
      ${testStuff}
      resolve: {
        alias: {
          "~": path.resolve(__dirname, "./${runtimes[0]}"),
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

  return await formatTypescript(source)
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
      `${variable}(${config ? JSON.stringify(config) : ""})`
  )
  .join(",\n")}
  ],

`

const getLibEntryPointpath = (presets: Presets) =>
  `lib/index.${presets.includes("typescript") ? "ts" : "js"}`
