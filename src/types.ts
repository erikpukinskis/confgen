export type Preset =
  | "api"
  | "apollo"
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

export type Command = "file" | "rm" | "run" | "script" | "yarn"

type CommandWithArgs =
  | {
      command: "file"
      path: string
      contents: string | string[] | Record<string, unknown>
    }
  | {
      command: "rm"
      path: string
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
  | {
      command: "yarn"
      dev?: boolean
      pkg: string
    }

export type CommandGenerator = (
  presets: Preset[],
  args: Record<Preset, string[]>
) => CommandWithArgs[]
