import type { CommandGenerator, Presets } from "@/commands"

export const generator: CommandGenerator = ({ presets }) => [
  ...(presets.includes("eslint") || presets.includes("prettier")
    ? ([
        {
          command: "script",
          name: "fix",
          script: buildFixCommand(presets),
        },
      ] as const)
    : []),
  {
    command: "script",
    name: "all",
    script: buildAllOfTheThingsCommand(presets),
  },
]

const buildFixCommand = (presets: Presets) => {
  const scripts = []
  if (presets.includes("eslint")) scripts.push("yarn fix:lint")
  if (presets.includes("prettier")) scripts.push("yarn fix:format")
  return scripts.join(" && ")
}

const buildAllOfTheThingsCommand = (presets: Presets) => {
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
  scripts.push("echo 🎉 Did all")

  return scripts.join(" && ")
}
