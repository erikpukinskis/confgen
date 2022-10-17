import type { CommandGenerator, Precheck } from "@/commands"

export const precheck: Precheck = ({ runtimes, args }) => {
  if (!runtimes.includes("lib")) {
    throw new Error(
      "Cannot use the bin preset unless there is a @lib runtime since we use that for the build"
    )
  }

  if (!args.dist.includes("lib")) {
    throw new Error(
      "Cannot use the bin preset without building the @lib runtime. Try confgen @lib bin dist:lib"
    )
  }
}

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
  {
    command: "script",
    name: "start:bin",
    script:
      "ts-node -r tsconfig-paths/register --transpile-only ./lib/index.ts",
  },
  {
    command: "yarn",
    pkg: "ts-node",
    dev: true,
  },
]
