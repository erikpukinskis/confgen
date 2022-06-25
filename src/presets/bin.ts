import type { CommandGenerator } from "@/commands"

export const generator: CommandGenerator = () => [
  {
    command: "script",
    name: "build:bin",
    script:
      "echo '#!/bin/bash\n/usr/bin/env node $(dirname -- $0)/index.umd.js $@\n' > dist/bin.sh && chmod a+x dist/bin.sh",
  },
  {
    command: "file",
    path: "package.json",
    contents: {
      bin: "./dist/bin.sh",
    },
  },
]
