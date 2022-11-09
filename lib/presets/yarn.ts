import type { CommandGenerator, CommandWithArgs } from "~/commands"

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
  ]

  if (!system.exists("yarn.lock")) {
    commands.push({
      command: "run",
      script: "yarn",
    })
  }

  return commands
}
