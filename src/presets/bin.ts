import { CommandGenerator } from "@/types"

export const bin: CommandGenerator = () => [
  {
    command: "script",
    name: "build:bin",
    script:
      "echo '#!/usr/bin/env node'|cat - dist/index.umd.js > /tmp/out && mv /tmp/out dist/index.umd.js; chmod a+x dist/index.umd.js",
  },
  {
    command: "file",
    path: "package.json",
    contents: {
      "bin": "./dist/index.umd.js",
    },
  },
]
