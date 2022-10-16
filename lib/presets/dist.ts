import type {
  CommandGenerator,
  Presets,
  System,
  Args,
  Precheck,
} from "@/commands"
import { isRuntime } from "@/runtimes"

export const precheck: Precheck = ({ args, presets }) => {
  if (args.dist.length < 1) {
    throw new Error(
      "dist preset needs to know which runtimes to distribute. Try dist:lib, dist:app:lib, etc"
    )
  }

  if (args.dist.includes("server")) {
    throw new Error(
      "Distributing @server runtimes is not supported. Servers by definition are started not exported. Do you mean dist:lib?"
    )
  }

  // if (args.dist.includes("lib") && args.dist.includes("package")) {
  //   throw new Error(
  //     "You can only distribute @lib or @app, not both at the same time, since they would conflict"
  //   )
  // }

  if (args.dist.includes("package")) {
    throw new Error("Distributing @package runtimes not supported")
  }

  if (!presets.includes("vite")) {
    throw new Error("Cannot use the dist preset without the vite preset\n")
  }

  const invalidRuntime = args.dist.find((arg) => !isRuntime(arg))

  if (invalidRuntime) {
    throw new Error(
      `${invalidRuntime} is not a valid runtime.\n\nTry dist:lib, dist:app, dist:server, dist:package or some combination of the four.`
    )
  }
}

export const generator: CommandGenerator = ({ presets, system, args }) => [
  {
    command: "script",
    name: "build",
    script: getScript(presets, system, args),
  },
]

const getScript = (presets: Presets, system: System, args: Args) => {
  const scripts: string[] = []

  const prepend = (script: string) => {
    if (scripts.includes(script)) return
    scripts.unshift(script)
  }

  const append = (script: string) => {
    if (scripts.includes(script)) return
    scripts.push(script)
  }

  // We only need this if we are building a library OR a package

  if (presets.includes("typescript")) {
    append("yarn build:types")
  }
  if (presets.includes("bin")) {
    append("yarn build:bin")
  }

  if (args.dist.includes("lib")) {
    prepend(`yarn build:lib`)
  }

  if (args.dist.includes("app")) {
    prepend(`yarn build:app`)
  }

  // if (args.dist.includes("package")) {
  //   append(`yarn build:package`)
  // }

  if (presets.includes("codegen")) {
    prepend("yarn build:generate")
  }

  prepend("rm -rf dist/*")

  return scripts.join(" && ")
}
