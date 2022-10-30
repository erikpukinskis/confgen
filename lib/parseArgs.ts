import type { GlobalArgs } from "~/args"
import { PRESET_NAMES } from "~/presets"
import { type Runtime, RUNTIMES } from "~/runtimes"

export class ParseError extends Error {}

export const RUNTIME_PATTERN = new RegExp(`^@(${RUNTIMES.join("|")})$`)

export const PRESET_CONFIG_PATTERN = new RegExp(
  `^(${PRESET_NAMES.join("|")})(:\\w+)*$`
)

const NAME_PATTERN = /^--([a-z-]+)$/
const ASSIGNMENT_PATTERN = /^--([a-z-]+)=(.*)$/

const BOOLEAN_ARGS = ["silent"]

export const parseArgs = ([...args]: string[]) => {
  const runtimes = [] as Runtime[]
  const presetConfigs = [] as string[]
  const globalArgs = {} as Record<string, string | boolean>

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const assignmentMatch = arg.match(ASSIGNMENT_PATTERN)
    const nameMatch = arg.match(NAME_PATTERN)
    const runtimeMatch = arg.match(RUNTIME_PATTERN)

    if (assignmentMatch) {
      const [, name, value] = assignmentMatch
      globalArgs[name] = value
    } else if (nameMatch) {
      const [, name] = nameMatch
      if (BOOLEAN_ARGS.includes(name)) {
        globalArgs[name] = true
      } else {
        globalArgs[name] = args[i + 1]
        i++
      }
    } else if (runtimeMatch) {
      const [, runtime] = runtimeMatch
      runtimes.push(runtime as Runtime)
    } else if (PRESET_CONFIG_PATTERN.test(arg)) {
      presetConfigs.push(arg)
    } else {
      throw new ParseError(`${arg} is not a valid argument`)
    }
  }

  if (runtimes.length < 1) {
    throw new ParseError(
      `You must include at least one runtime (e.g. @app, @lib, etc)`
    )
  }

  assertNoDuplicates(presetConfigs)

  return { runtimes, presetConfigs, globalArgs: globalArgs as GlobalArgs }
}

export const addDefaultPresets = (presetConfigs: string[]) => {
  if (!presetConfigs.includes("all")) presetConfigs.unshift("all")
  if (!presetConfigs.includes("git")) presetConfigs.unshift("git")
  if (!presetConfigs.includes("templates")) presetConfigs.unshift("templates")
}

const assertNoDuplicates = (configs: string[]) => {
  const presetNames = configs.map((config) => config.split(/[@:]/)[0])
  const seen: Record<string, true> = {}
  for (const name of presetNames) {
    if (seen[name]) {
      throw new ParseError(
        `Cannot add the same preset twice: duplicate ${name}`
      )
    }
    seen[name] = true
  }
}
