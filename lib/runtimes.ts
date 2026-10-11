import type { Contribution, ProduceContributions } from "./contributions.js"
import type { ProjectFacts } from "./facts.js"
import type { Selection } from "./selection.js"

export type RuntimeName =
  | "lib"
  | "app"
  | "server"
  | "client"
  | "integration"
  | "gateway"
  | "docs"

/** Canonical runtime order. CLI order does not override this. */
export const RUNTIME_NAMES = [
  "lib",
  "app",
  "server",
  "client",
  "integration",
  "gateway",
  "docs",
] satisfies readonly RuntimeName[]

/** Fixed directory for each runtime, relative to the project root. */
export const RUNTIME_PATHS = {
  lib: "lib",
  app: "app",
  server: "server",
  client: "client",
  integration: "integration",
  gateway: "gateway",
  docs: "docs",
} satisfies Record<RuntimeName, string>

export function isRuntimeName(value: string): value is RuntimeName {
  for (const name of RUNTIME_NAMES) {
    if (name === value) return true
  }
  return false
}

export function runtimePath(runtime: RuntimeName): string {
  return RUNTIME_PATHS[runtime]
}

/**
 * Runtime-owned contributions for the fixed directory of that runtime.
 * Toolchain output that spans runtimes belongs to the owning preset.
 */
const runtimeProducers: Record<RuntimeName, ProduceContributions> = {
  lib: () => [],
  app: () => [],
  server: () => [],
  client: () => [],
  integration: () => [],
  gateway: () => [],
  docs: () => [],
}

export function runtimeContributions(
  runtime: RuntimeName,
  selection: Selection,
  facts: ProjectFacts
): readonly Contribution[] {
  const produce = runtimeProducers[runtime]
  if (produce === undefined) {
    throw new Error(`Missing runtime producer for ${runtime}`)
  }
  return produce(selection, facts)
}
