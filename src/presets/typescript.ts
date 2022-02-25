import { CommandGenerator, Args } from "@/types"

const tsconfigPath = (args: Args) => args.typescript[0] || "tsconfig.json"

export const typescript: CommandGenerator = (presets, args) => [
  {
    command: "yarn",
    dev: true,
    pkg: "typescript",
  },
  ...(presets.includes("library")
    ? ([
        {
          command: "script",
          name: "build:types",
          script: `tsc --declaration --emitDeclarationOnly -p ${tsconfigPath(
            args
          )} --outDir dist --skipLibCheck; mv dist/index.d.ts dist/index.umd.d.ts`,
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "check:types",
    script:
      "tsc --noEmit; if [ $? -eq 0 ]; then echo 8J+OiSBUeXBlcyBhcmUgZ29vZCEKCg== | base64 -d; fi",
  },
  {
    command: "file",
    path: tsconfigPath(args),
    contents: {
      compilerOptions: {
        lib: ["es2017", ...(presets.includes("react") ? ["dom"] : [])],
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        skipLibCheck: true,
        ...(presets.includes("react") ? { jsx: "react" } : undefined),
      },
    },
  },
]
