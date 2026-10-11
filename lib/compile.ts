import { collectContributions, type Contribution } from "./contributions.js"
import { readProjectFacts, type ProjectFacts } from "./facts.js"
import { parseSelection, type Selection } from "./selection.js"
import type { System } from "./system.js"

export type Compilation = {
  selection: Selection
  facts: ProjectFacts
  contributions: readonly Contribution[]
}

/**
 * Parses the selection, reads package manifests, and collects contributions.
 * This does not write project files.
 */
export async function compile(input: {
  selection: readonly string[]
  system: System
}): Promise<Compilation> {
  const selection = parseSelection(input.selection)
  const facts = await readProjectFacts(input.system)
  const contributions = collectContributions(selection, facts)
  return { selection, facts, contributions }
}
