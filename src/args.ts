import {
  type Presets,
  type PresetName,
  PRESET_NAMES,
  isPresetName,
} from "@/presets"

export type Args = { readonly [index in PresetName]: string[] }

export const EMPTY_ARGS: Args = PRESET_NAMES.reduce(
  (argsByPresetName, preset) => ({
    ...argsByPresetName,
    [preset]: [],
  }),
  {} as Args
)

export const parsePresetConfigs = (
  configs: string[]
): { argsByPresetName: Args; presetNames: Presets } => {
  const argsByPresetName = {
    ...EMPTY_ARGS,
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
