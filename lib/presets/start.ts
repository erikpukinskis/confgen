import type { CommandGenerator } from "@/commands"

export const generator: CommandGenerator = ({ presets, builds }) => {
  if (!presets.includes("vite")) {
    throw new Error(`Cannot build ${builds.join("+")} without the vite preset`)
  }
  return [
    ...(builds.includes("server")
      ? ([
          {
            command: "yarn",
            dev: true,
            pkg: "vite-node",
          },
          {
            command: "script",
            name: "start:api",
            script: `vite-node server/`,
          },
        ] as const)
      : []),
  ]
}
