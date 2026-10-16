import type { ProduceContributions } from "../contributions.js"

/**
 * GitHub Packages selects npm publication. The target registry stays
 * `publishConfig.registry` on each manifest; this preset does not add a
 * second registry setting.
 */
export const contributions: ProduceContributions = () => []
