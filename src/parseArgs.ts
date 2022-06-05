const USAGE = `
confgen <folders> <presets>

Examples:
  confgen app+server+package build@app+package codegen@app:queries react vitest
  confgen lib+app+package build@lib react vitest
  confgen lib+package build@lib codegen@lib:schema:resolvers vitest

Options:
  <folders>     Plus-separated selection of standard folders where source code will be located:

                  lib — code is called via an interface (either in Node or the browser)
                  app — code that boots in an HTML context in the browser
                  server — code that boots in Node
                  package — code that consumes the built packaged

                These are the ONLY folders which may be used for source code.

  <presets>     Space-separated presets defining which features to be configured. Presets
                may be tied to a specific folder or folders, using the @ symbol, and may
                have a number of colon-separated arguments

                Ex:
                  prettier
                  build@app+lib
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
                  build[@folder1][+folder2]   Makes your package importable via UMD and ES for a given env mode (development, production, etc)
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

const FOLDER_PATTERN = /^(lib|app|server|package)(\+(lib|app|server|package))*$/

export const parseArgs = ([folderString, ...presetConfigs]: string[]) => {
  if (!folderString || !FOLDER_PATTERN.test(folderString)) {
    console.error(
      "First argument must be a plus-separated list of standard folders:"
    )
    console.log(USAGE)
    process.exit(1)
  }

  addDefaultPresets(presetConfigs)

  const presetNames = presetConfigs.map((config) => config.split(/[@:]/)[0])

  assertNoDuplicates(presetNames)

  const folders = folderString.split("+")

  sortPresetConfigs(presetConfigs)

  return { folders, presetConfigs }
}

const addDefaultPresets = (presetConfigs: string[]) => {
  if (!presetConfigs.includes("all")) presetConfigs.unshift("all")
  if (!presetConfigs.includes("git")) presetConfigs.unshift("git")
}

const assertNoDuplicates = (presetNames: string[]) => {
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
