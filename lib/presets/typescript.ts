import type { CommandGenerator, Precheck, Builds } from "@/commands"

export const precheck: Precheck = ({ args }) => {
  if (args.typescript.length > 0) {
    throw new Error("[typescript] preset should have no args")
  }
}

const tsconfigPath = () => "tsconfig.json"

export const generator: CommandGenerator = ({ presets, builds }) => [
  {
    command: "yarn",
    dev: true,
    pkg: "typescript",
  },
  ...(presets.includes("dist")
    ? ([
        {
          command: "yarn",
          dev: true,
          pkg: "tsc-alias",
        },
        {
          command: "script",
          name: "build:types",
          script: `tsc --declaration --emitDeclarationOnly -p ${tsconfigPath()} --skipLibCheck && tsc-alias -p ${tsconfigPath()} && mv dist/index.d.ts dist/index.umd.d.ts`,
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "check:types",
    script: `tsc --noEmit -p ${tsconfigPath()}; if [ $? -eq 0 ]; then echo 8J+OiSBUeXBlcyBhcmUgZ29vZCEKCg== | base64 -d; else exit 1; fi`,
  },
  {
    command: "file",
    path: tsconfigPath(),
    contents: {
      compilerOptions: {
        lib: ["es2017", ...(presets.includes("react") ? ["dom"] : [])],
        baseUrl: ".",
        paths: buildPathAliases(builds),
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        downlevelIteration: true,
        ...(presets.includes("react") ? { jsx: "react" } : undefined),
        ...(presets.includes("dist") ? { outDir: "dist" } : undefined),
      },
      include: builds,
    },
  },
]

/**
 * Takes an array of builds (['app', 'lib', etc]) and returns the top-down path
 * aliases for the tsconfig, e.g.:
 *
 *     {
 *       "@app/*": ["app/*"],
 *       "@lib/*": ["lib/*"],
 *       etc...
 *     }
 */
const buildPathAliases = (builds: Builds) =>
  builds.reduce(
    (paths, build) => ({
      ...paths,
      [`@${build}/*`]: [`${build}/*`],
    }),
    {}
  )
