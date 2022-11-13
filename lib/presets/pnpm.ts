import type { CommandGenerator, CommandWithArgs, Precheck } from "~/commands"

export const precheck: Precheck = ({ system }) => {
  const out: string[] = []
  system.run("which pnpm", out)
  if (!/pnpm/.test(out.join(""))) {
    throw new Error(
      "pnpm must be installed to use the pnpm preset: https://pnpm.io/installation"
    )
  }
}

export const generator: CommandGenerator = ({ system }) => {
  const commands: CommandWithArgs[] = []

  if (
    !system.exists("pnpm-lock.yaml") &&
    (system.exists("package-lock.json") ||
      system.exists("yarn.lock") ||
      system.exists("npm-shrinkwrap.json"))
  ) {
    commands.push({
      command: "run",
      script: "pnpm import",
    })
  } else if (!system.exists("pnpm-lock.yaml")) {
    commands.push({
      command: "run",
      script: "pnpm install",
    })
  }

  commands.push(
    {
      command: "run",
      script: "rm -f package-lock.json",
    },
    {
      command: "run",
      script: "rm -f yarn.lock",
    },
    {
      command: "run",
      script: "rm -f npm-shrinkwrap.json",
    }
  )

  return commands
}
