export const PRESETS = [
  "all",
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

export type FileCommand = {
  command: "file"
  path: string
  contents: string | string[] | Record<string, unknown>
  merge?: "if-not-exists" | "prefer-existing" | "prefer-preset"
}

type RunCommand = {
  command: "run"
  script: string
}

type ScriptCommand = {
  command: "script"
  name: string
  script: string
}

export type CommandWithArgs = { preset?: Preset } & (
  | FileCommand
  | RunCommand
  | ScriptCommand
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

export type Args = Record<Preset, string[]>

export type CommandGenerator = (
  presets: Preset[],
  args: Args
) => CommandWithArgs[]
