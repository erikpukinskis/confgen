export type Preset =
  | "api"
  | "base"
  | "bump"
  | "devServer"
  | "emotion"
  | "eslint"
  | "library"
  | "node"
  | "prettier"
  | "react"
  | "typescript"
  | "vite"
  | "vitest"
  | "yarn"

export type Command = "yarn" | "script" | "file" | "executable"

type CommandString = Command | `${Command}:${string}`

export type Configgen = (
  presets: Preset[],
  args: Record<Preset, string[]>
) => Partial<Record<CommandString, string | Record<string, unknown> | string[]>>
