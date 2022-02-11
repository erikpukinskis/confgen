import { CommandGenerator } from "./types"

export const typescript: CommandGenerator = (presets) => [
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
          script:
            "tsc --declaration --emitDeclarationOnly --outDir dist --skipLibCheck; mv dist/index.d.ts dist/index.umd.d.ts",
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "check:types",
    script:
      "tsc --noEmit --skipLibCheck; if [ $? -eq 0 ]; then echo 8J+OiSBUeXBlcyBhcmUgZ29vZCEKCg== | base64 -d; fi",
  },
]
