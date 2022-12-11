import { getGithubWorkflow } from "./githubActions"
import type {
  CommandGenerator,
  Precheck,
  Runtimes,
  Presets,
  CommandWithArgs,
} from "~/commands"

export const precheck: Precheck = ({ args }) => {
  if (args.typescript.length > 0) {
    throw new Error("[typescript] preset should have no args")
  }
}

const tsconfigPath = () => "tsconfig.json"

export const generator: CommandGenerator = ({ presets, runtimes }) => {
  const commands: CommandWithArgs[] = [
    {
      command: "yarn",
      pkg: "typescript@4.9.4",
      dev: true,
    },
    {
      command: "yarn",
      pkg: "@types/node@16.18.8",
      dev: true,
    },
    {
      command: "script",
      name: "check:types",
      script: `tsc --noEmit -p ${tsconfigPath()}; if [ $? -eq 0 ]; then echo 8J+OiSBUeXBlcyBhcmUgZ29vZCEKCg== | base64 -d; else exit 1; fi`,
    },
    {
      command: "file",
      path: tsconfigPath(),
      contents: getConfig(presets, runtimes),
    },
  ]

  if (presets.includes("dist")) {
    commands.push(
      {
        command: "yarn",
        dev: true,
        pkg: "tsc-alias",
      },
      {
        command: "file",
        path: "tsconfig.dist.json",
        contents: getDistConfig(),
      },
      {
        command: "script",
        name: "build:types",
        script: `tsc --declaration --emitDeclarationOnly -p tsconfig.dist.json --skipLibCheck && tsc-alias -p ${tsconfigPath()} && mv dist/index.d.ts dist/lib.umd.d.ts`,
      }
    )
  }

  if (presets.includes("githubActions")) {
    commands.push({
      command: "file",
      path: ".github/workflows/check-types.yml",
      contents: getTypeCheckWorkflow(presets),
      merge: "replace",
    })
  }
  return commands
}

const getTypeCheckWorkflow = (presets: Presets) => {
  const steps = [
    {
      run: "yarn check:types",
    },
  ]

  if (presets.includes("dist")) {
    steps.unshift({
      run: "yarn build",
    })
  }

  return getGithubWorkflow({
    needsPackages: true,
    workflowName: "types",
    jobs: [
      {
        jobName: "check",
        steps,
      },
    ],
  })
}

/**
 * ~~~~~Takes an array of runtimes (['app', 'lib', etc]) and returns the top-down path
 * aliases for the tsconfig, e.g.:~~~~~ Edit: No longer aliases all of the runtimes,
 * just the first one
 *
 *     {
 *       "@app/*": ["app/*"],
 *       "@lib/*": ["lib/*"],
 *       etc...
 *     }
 */
const getPathAliases = (runtimes: Runtimes) => ({
  "~/*": [`${runtimes[0]}/*`],
})

/**
 * Special config for just building lib.
 */
const getDistConfig = () => ({
  extends: "./tsconfig.json",
  include: ["lib"],
})

const getConfig = (presets: Presets, runtimes: Runtimes) => ({
  compilerOptions: {
    lib: ["es2017", ...(presets.includes("react") ? ["dom"] : [])],
    baseUrl: ".",
    paths: getPathAliases(runtimes),
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    strict: true,
    skipLibCheck: true,
    downlevelIteration: true,
    ...(presets.includes("react") ? { jsx: "react-jsx" } : undefined),
    ...(presets.includes("dist") ? { outDir: "dist" } : undefined),
  },
  include: runtimes,
})
