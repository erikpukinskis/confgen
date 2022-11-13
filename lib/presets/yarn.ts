import type { CommandGenerator, CommandWithArgs, Precheck } from "~/commands"

export const precheck: Precheck = ({ system }) => {
  const out: string[] = []
  system.run("which yarn", out)
  if (!/yarn/.test(out.join(""))) {
    throw new Error(
      "yarn must be installed to use the yarn preset: https://classic.yarnpkg.com/lang/en/docs/cli/install"
    )
  }
}

export const generator: CommandGenerator = ({ system }) => {
  const commands: CommandWithArgs[] = [
    {
      command: "file",
      merge: "prefer-existing",
      path: "package.json",
      contents: {
        license: "UNLICENSED",
      },
    },
    {
      command: "run",
      script: "rm -f package-lock.json",
    },
    {
      command: "run",
      script: "rm -f pnpm-lock.yaml",
    },
  ]

  if (!system.exists("yarn.lock")) {
    commands.push({
      command: "run",
      script: "yarn",
    })
  }

  return commands
}
