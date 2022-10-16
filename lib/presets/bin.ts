import type { CommandGenerator } from "@/commands"

export const generator: CommandGenerator = () => [
  {
    command: "script",
    name: "build:bin",
    script:
      "echo '#!/usr/bin/env node'|cat - dist/lib.umd.js > /tmp/out && mv /tmp/out dist/lib.umd.js && chmod a+x dist/lib.umd.js",
  },
  {
    command: "file",
    path: "package.json",
    contents: {
      bin: "./dist/lib.umd.js",
    },
  },
]
