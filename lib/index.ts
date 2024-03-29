import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { parseArgs, addDefaultPresets, ParseError } from "./parseArgs"
import { Project } from "./project"
import { RealSystem } from "./system"

const USAGE = `
confgen <runtimes> <presets>

Examples:
  confgen @app @server @package dist:app:package codegen:app:queries react vitest
  confgen @lib @app @package dist:lib react vitest
  confgen @lib @package dist:lib codegen:lib:schema:resolvers vitest

Options:
  <runtimes>    Space separated selection of "runtimes" i.e. folders with code meant to be
                run in a specific environment:

                  @lib — code is called via a library interface (either in Node or the browser)
                  @app — code that boots in an HTML context in the browser
                  @server — code that boots in Node
                  @package — code that consumes the build (e.g. dist tests)
                  @docs — same as app, but reserved for your documentation site

                These folders (lib/, app/, etc) are the ONLY folders which may be used
                for source code.

  <presets>     Space-separated presets defining which features to be configured. Presets
                may be tied to a specific folder or folders, using the @ symbol, and may
                have a number of colon-separated arguments

                Examples:
                  prettier
                  dist:app:lib
                  codegen:lib:schema:resolvers

                  Available presets:
                  bin                         Adds a "bin" to your package JSON
                  codedocs                    Deploy a documentation site to Github Pages
                  codegen:resolvers           Generate types for Apollo Server resolvers
                  codegen:schema              Compiles a GraphQL schema to TypeScript so it it can
                                              be exported from a library
                  codegen:operations          Compiles a typed gql function for all of your Apollo
                                              Client queries and mutations
                  codespaces                  Sets up some good VSCode defaults, and adds
                                              extensions eslint, prettier, etc presets
                  dist[:runtime1][:runtime2]  Generate importable files for selected runtimes
                                              importable from dist/
                  eslint                      Sets up linting with fix-on-save in codespaces
                  git                         Pre-populates gitignore
                  githubActions               Add workflows for testing, linting, publishing, etc
                  githubPackage               Use Github to publish and install packages
                  macros                      Enables babel macros in Vite
                  node[:fs][:path][etc...]    Configures codespace to use the Node.js environment
                                              and sets up the Node packages needed inVite
                  prettier                    Code formatting with format-on-save in codespace
                  react                       Enable React in eslint, typescript, etc
                  sql                         Sets up Vite plugin for importing sql
                  start                       Adds command to start a server
                  typescript:[tsconfig path]  Do stuff in TypeScript, check types, etc
                  vite                        Use Vite for dev server and builds
                  vitest                      Configures test scripts
                  yarn                        Creates a yarn.lock file

  --silent      Suppress logging during normal operation
`

const getVersion = () => {
  const result = execSync(`ls -l node_modules | grep ^l || true`, {
    stdio: "pipe",
  })

  const lines = result.toString().split("\n")

  for (const line of lines) {
    const match = line.match(/(\w+) -> (.+)/)

    if (!match) continue

    const [, pkg, path] = match

    if (pkg === "confgen") {
      return path
    }
  }

  let packageJsonPath = path.join(__dirname, "..", "package.json")
  if (!existsSync(packageJsonPath)) {
    packageJsonPath = path.join(__dirname, "..", "..", "package.json")
  }
  if (!existsSync(packageJsonPath)) {
    return "unknown"
  }
  const contents = readFileSync(packageJsonPath).toString()
  const json = JSON.parse(contents) as { version?: string }
  return json.version
}

try {
  const [, , ...args] = process.argv
  const { presetConfigs, runtimes, globalArgs } = parseArgs(args)

  addDefaultPresets(presetConfigs)

  const system = new RealSystem({ silent: Boolean(globalArgs.silent) })

  system.silent ||
    console.info(`————————————————————————————————————————————————
👷 Running confgen@${getVersion()}
————————————————————————————————————————————————`)

  const project = new Project({ presetConfigs, runtimes, globalArgs, system })

  void project.confgen()
} catch (e) {
  if (e instanceof ParseError) {
    console.error(e.message)
    console.info(USAGE)
  } else {
    throw e
  }
}
