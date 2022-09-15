export const BUILDS = ["lib", "app", "server", "package"] as const

export type Build = typeof BUILDS[number]

export const isBuild = (string: string): string is Build => {
  return BUILDS.includes(string as Build)
}
