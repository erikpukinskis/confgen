export const RUNTIMES = ["lib", "app", "server", "package"] as const

export type Runtime = typeof RUNTIMES[number]

export const isRuntime = (string: string): string is Runtime => {
  return RUNTIMES.includes(string as Runtime)
}
