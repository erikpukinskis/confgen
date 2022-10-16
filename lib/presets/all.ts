import type { CommandGenerator, Presets } from "@/commands"

export const generator: CommandGenerator = ({ presets }) => [
  ...(presets.includes("eslint") || presets.includes("prettier")
    ? ([
        {
          command: "script",
          name: "fix",
          script: getFixCommand(presets),
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "all",
    script: getAllOfTheThingsCommand(presets),
  },
]

const getFixCommand = (presets: Presets) => {
  const scripts = []
  if (presets.includes("eslint")) scripts.push("yarn fix:lint")
  if (presets.includes("prettier")) scripts.push("yarn fix:format")
  return scripts.join(" && ")
}

const getAllOfTheThingsCommand = (presets: Presets) => {
  const scripts = ["yarn"]

  if (presets.includes("dist")) {
    scripts.push("yarn build")
  }
  if (presets.includes("eslint") || presets.includes("prettier")) {
    scripts.push("yarn fix")
  }
  if (presets.includes("typescript")) {
    scripts.push("yarn check:types")
  }
  if (presets.includes("vitest")) {
    scripts.push("yarn test")
  }

  // This is just for fun, but it allows you to run "yarn all of the things!"
  // instead of just "yarn all"
  scripts.push("echo `echo 8J+OiSBEaWQgYWxs | base64 -d`")

  return scripts.join(" && ")
}
