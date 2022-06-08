import { type PresetName, PRESET_NAMES, isPresetName } from "@/presets"

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

  return { argsByPresetName, presetNames }
}
