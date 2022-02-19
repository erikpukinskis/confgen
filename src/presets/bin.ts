import { CommandGenerator } from "@/types"

export const bin: CommandGenerator = () => [
  {
    command: "script",
    name: "build:bin",
    script: "chmod a+x dist/index.umd.js",
  },
  {
    command: "file",
    path: "package.json",
    contents: {
      "bin": "./dist/index.umd.js",
    },
  },
]
