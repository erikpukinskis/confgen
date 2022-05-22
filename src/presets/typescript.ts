import type { CommandGenerator } from "@/commands"
import type { Args } from "@/args"

const tsconfigPath = (args: Args) => args.typescript[0] || "tsconfig.json"

export const generator: CommandGenerator = (presets, args) => [
  {
    command: "yarn",
    dev: true,
    pkg: "typescript",
  },
  ...(presets.includes("library")
    ? ([
        {
          command: "yarn",
          dev: true,
          pkg: "tsc-alias",
        },
        {
          command: "script",
          name: "build:types",
          script: `tsc --declaration --emitDeclarationOnly -p ${tsconfigPath(
            args
          )} --skipLibCheck && tsc-alias -p ${tsconfigPath(
            args
          )} && mv dist/index.d.ts dist/index.umd.d.ts`,
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "check:types",
    script: `tsc --noEmit -p ${tsconfigPath(
      args
    )}; if [ $? -eq 0 ]; then echo 8J+OiSBUeXBlcyBhcmUgZ29vZCEKCg== | base64 -d; else exit 1; fi`,
  },
  {
    command: "file",
    path: tsconfigPath(args),
    contents: {
      compilerOptions: {
        lib: ["es2017", ...(presets.includes("react") ? ["dom"] : [])],
        baseUrl: ".",
        paths: {
          "@/*": ["src/*"],
        },
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        downlevelIteration: true,
        ...(presets.includes("react") ? { jsx: "react" } : undefined),
        ...(presets.includes("library") ? { outDir: "dist" } : undefined),
      },
    },
  },
]
