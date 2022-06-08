const BUILDS = ["lib", "app", "server", "package"] as const

export type Build = typeof BUILDS[number]

/**
 * app, app+server, etc
 */
export const BUILDS_PATTERN =
  /^(lib|app|server|package)(\+(lib|app|server|package))*$/

export const isBuild = (string: string): string is Build => {
  return BUILDS.includes(string as Build)
}
