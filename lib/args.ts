import { type PresetName, PRESET_NAMES, isPresetName } from "~/presets"

const GLOBAL_ARGS = ["name"]

export type GlobalArg = typeof GLOBAL_ARGS[number]

export type GlobalArgs = {
  readonly [index in GlobalArg]: string
}

export type Args = { readonly [index in PresetName]: string[] } & {
  global: GlobalArgs
}

const getEmptyArgs = (global: GlobalArgs) =>
  PRESET_NAMES.reduce(
    (argsByPresetName, preset) => ({
      ...argsByPresetName,
      [preset]: [],
    }),
    { global } as Args
  )

export const parsePresetConfigs = (
  configs: string[],
  globalArgs: GlobalArgs
): { argsByPresetName: Args; presetNames: PresetName[] } => {
  const argsByPresetName = {
    ...getEmptyArgs(globalArgs),
  }

  const presetNames = configs.map((config) => {
    const [presetName, ...presetArgs] = config.split(":")
    if (!isPresetName(presetName)) {
      throw new Error(
        `${presetName} is not a valid preset.\n\nUsage:\nnpx confgen [${PRESET_NAMES.join(
          " | "
        )}]\n`
      )
    }
    argsByPresetName[presetName] = presetArgs
    return presetName
  })

  sortPresets(presetNames)

  return { argsByPresetName, presetNames }
}

/**
 * Eslint makes things better, and Prettier makes things pretty so we want
 * prettier to be last and eslint to be second-to-last
 */
const sortPresets = (names: string[]) => {
  if (names.includes("eslint")) {
    const index = names.indexOf("eslint")
    names.splice(index, 1)
    names.push("eslint")
  }
  if (names.includes("prettier")) {
    const index = names.indexOf("prettier")
    names.splice(index, 1)
    names.push("prettier")
  }
  if (names.includes("templates")) {
    const index = names.indexOf("templates")
    names.splice(index, 1)
    names.unshift("templates")
  }
}
