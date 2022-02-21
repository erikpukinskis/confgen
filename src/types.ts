export const PRESETS = [
  "api",
  "apollo",
  "bin",
  "codespaces",
  "devServer",
  "macros",
  "eslint",
  "git",
  "library",
  "node",
  "prettier",
  "react",
  "sql",
  "typescript",
  "vite",
  "vitest",
  "yarn",
] as const

export type Preset = typeof PRESETS[number]

export type Command = "file" | "run" | "script" | "yarn"

export type CommandWithArgs = { preset?: Preset } & (
  | {
      command: "file"
      path: string
      contents: string | string[] | Record<string, unknown>
    }
  | {
      command: "run"
      script: string
    }
  | {
      command: "script"
      name: string
      script: string
    }
  | PackageCommand
  | DevPackageCommand
)

export function isPackageCommand(
  command: CommandWithArgs
): command is PackageCommand {
  return command.command === "yarn" && !(command as DevPackageCommand).dev
}

export type PackageCommand = {
  command: "yarn"
  pkg: string
}

export function isDevPackageCommand(
  command: CommandWithArgs
): command is DevPackageCommand {
  return command.command === "yarn" && (command as DevPackageCommand).dev
}

export type DevPackageCommand = PackageCommand & {
  dev: true
}

export type CommandGenerator = (
  presets: Preset[],
  args: Record<Preset, string[]>
) => CommandWithArgs[]
