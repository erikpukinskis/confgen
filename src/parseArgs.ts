import { type Build, BUILDS_PATTERN } from "@/builds"
import type { GlobalArg, GlobalArgs } from "@/args"

const USAGE = `
confgen <builds> [--name <name>] <presets>

Examples:
  confgen app+server+package dist@app+package codegen@app:queries react vitest
  confgen lib+app+package --name MyPackage dist@lib react vitest
  confgen lib+package --name MyPackage dist@lib codegen@lib:schema:resolvers vitest

Options:
  <builds>        Plus-separated selection of "builds" i.e. folders with code meant to be
                  run in a specific environment:

                     lib — code is called via a library interface (either in Node or the browser)
                     app — code that boots in an HTML context in the browser
                     server — code that boots in Node
                     package — code that consumes the build (e.g. dist tests, or an app wrapper)

                  These folders (lib/, app/, etc) are the ONLY folders which may be used
                  for source code.

  --name <name>   A name to be used for the package in builds

  <presets>       Space-separated presets defining which features to be configured. Presets
                  may be tied to a specific folder or folders, using the @ symbol, and may
                  have a number of colon-separated arguments

                  Ex:
                    prettier
                    dist@app+lib
                    codegen@lib:schema:resolvers

                  Available presets:
                    start[@folder1][+folder2]   Adds start commands for each folder
                    codegen:resolvers           Generate types for Apollo Server resolvers
                    codegen:schema              Compiles a GraphQL schema to TypeScript so it it can be exported from a library
                    codegen:operations          Compiles a typed gql function for all of your Apollo Client queries and mutations
                    bin                         Adds a "bin" to your package JSON
                    codespaces                  Sets up some good VSCode defaults, and adds extensions eslint, prettier, etc presets
                    eslint                      Sets up linting with fix-on-save in Codespaces
                    git                         Pre-populates gitignore
                    dist[@folder1][+folder2]   Makes your package importable via UMD and ES for a given env mode (development, production, etc)
                    macros                      Enables babel macros in Vite
                    node[:fs][:path][etc...]    Configures a Codespace to use the Node.js environment and sets up the Node packages needed in Vite
                    prettier                    Set up code formatting with format-on-save in Codespaces
                    react                       Ensures React is set up properly with eslint, typescript, etc
                    sql                         Sets up Vite plugin for importing sql
                    typescript:[tsconfig path]  Adds type checking commands, and sets up exported typings
                    vite                        Sets up Vite, with a dev server, library build or both depending on the other presets
                    vitest                      Configures test scripts
                    yarn                        Creates a yarn.lock file

`

export const parseArgs = ([buildsString, ...args]: string[]) => {
  const presetConfigs = [] as string[]
  const globalArgs = {} as Record<string, string>

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const equalsMatch = arg.match(/^--([a-z-]+)=(.*)$/)
    const nameMatch = arg.match(/^--([a-z-]+)$/)

    if (equalsMatch) {
      const [, name, value] = equalsMatch
      globalArgs[name] = value
    } else if (nameMatch) {
      const [, name] = nameMatch
      globalArgs[name] = args[i + 1]
      i++
    } else {
      presetConfigs.push(arg)
    }
  }

  if (!buildsString || !BUILDS_PATTERN.test(buildsString)) {
    console.error(
      "First argument must be a plus-separated list of standard builds"
    )
    console.log(USAGE)
    process.exit(1)
  }

  assertNoDuplicates(presetConfigs)

  const builds = buildsString.split("+") as Build[]

  sortPresetConfigs(presetConfigs)

  return { builds, presetConfigs, globalArgs: globalArgs as GlobalArgs }
}

export const addDefaultPresets = (presetConfigs: string[]) => {
  if (!presetConfigs.includes("all")) presetConfigs.unshift("all")
  if (!presetConfigs.includes("git")) presetConfigs.unshift("git")
  if (!presetConfigs.includes("templates")) presetConfigs.unshift("templates")
}

const assertNoDuplicates = (configs: string[]) => {
  const presetNames = configs.map((config) => config.split(/[@:]/)[0])
  const seen: Record<string, true> = {}
  for (const name of presetNames) {
    if (seen[name]) {
      console.error(`Cannot add the same preset twice: duplicate ${name}`)
      process.exit(1)
    }
    seen[name] = true
  }
}

/**
 * Eslint makes things better, and Prettier makes things pretty so we want
 * prettier to be last and eslint to be second-to-last
 */
const sortPresetConfigs = (configs: string[]) => {
  if (configs.includes("eslint")) {
    const index = configs.indexOf("eslint")
    configs.splice(index, 1)
    configs.push("eslint")
  }
  if (configs.includes("prettier")) {
    const index = configs.indexOf("prettier")
    configs.splice(index, 1)
    configs.push("prettier")
  }
}
