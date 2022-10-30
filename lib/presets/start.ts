import type { CommandGenerator } from "~/commands"

export const generator: CommandGenerator = ({ presets, runtimes }) => {
  if (!presets.includes("vite")) {
    throw new Error(
      `Cannot build ${runtimes
        .map((runtime) => `@${runtime}`)
        .join(" ")} without the vite preset`
    )
  }
  return [
    ...(runtimes.includes("server")
      ? ([
          {
            command: "yarn",
            dev: true,
            pkg: "vite-node",
          },
          {
            command: "script",
            name: "start:server",
            script: `vite-node server/`,
          },
        ] as const)
      : []),
  ]
}
