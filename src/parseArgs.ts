import { type Build, BUILDS } from "@/builds"
import type { GlobalArgs } from "@/args"
import { PRESET_NAMES } from "@/presets"

export class ParseError extends Error {}

export const BUILD_PATTERN = new RegExp(`^@(${BUILDS.join("|")})$`)

export const PRESET_CONFIG_PATTERN = new RegExp(
  `^(${PRESET_NAMES.join("|")})(:\\w+)*$`
)

export const parseArgs = ([...args]: string[]) => {
  const builds = [] as Build[]
  const presetConfigs = [] as string[]
  const globalArgs = {} as Record<string, string>

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const equalsMatch = arg.match(/^--([a-z-]+)=(.*)$/)
    const nameMatch = arg.match(/^--([a-z-]+)$/)
    const buildMatch = arg.match(BUILD_PATTERN)

    if (equalsMatch) {
      const [, name, value] = equalsMatch
      globalArgs[name] = value
    } else if (nameMatch) {
      const [, name] = nameMatch
      globalArgs[name] = args[i + 1]
      i++
    } else if (buildMatch) {
      const [, build] = buildMatch
      builds.push(build as Build)
    } else if (PRESET_CONFIG_PATTERN.test(arg)) {
      presetConfigs.push(arg)
    } else {
      throw new ParseError(`${arg} is not a valid argument`)
    }
  }

  if (builds.length < 1) {
    throw new ParseError(
      `You must include at least one build (e.g. @app, @lib, etc)`
    )
  }

  assertNoDuplicates(presetConfigs)

  return { builds, presetConfigs, globalArgs: globalArgs as GlobalArgs }
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
