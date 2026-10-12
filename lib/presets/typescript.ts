import type {
  Contribution,
  JsonValue,
  ProduceContributions,
  StructuredAddress,
} from "../contributions.js"
import { runtimePath, type RuntimeName } from "../runtimes.js"
import type { Selection } from "../selection.js"

/**
 * TypeScript owns TypeScript configuration for every selected runtime,
 * including project scope and package subpath imports.
 */
export const contributions: ProduceContributions = (selection) => [
  dependency("typescript", "5.9.3"),
  dependency("@types/node", "24.19.2"),
  script("check:types", "tsc --noEmit -p tsconfig.json"),
  option("target", "ES2024"),
  option("module", "NodeNext"),
  option("moduleResolution", "NodeNext"),
  option("strict", true),
  option("noUncheckedIndexedAccess", true),
  option("exactOptionalPropertyTypes", true),
  option("verbatimModuleSyntax", true),
  option("skipLibCheck", true),
  option("types", ["node"]),
  option("noEmit", true),
  tsconfig("typescript:include", ["include"], includePaths(selection), "merge"),
  ...selection.runtimes.map((runtime) => importMap(runtime)),
]

function includePaths(selection: Selection): string[] {
  return selection.runtimes.map((runtime) => `${runtimePath(runtime)}/**/*.ts`)
}

function importMap(runtime: RuntimeName): Contribution {
  return json(
    `typescript:import:${runtime}`,
    ["imports", `#${runtime}/*`],
    `./${runtimePath(runtime)}/*.ts`,
    "replace"
  )
}

function option(name: string, value: JsonValue): Contribution {
  return tsconfig(
    `typescript:compiler:${name}`,
    ["compilerOptions", name],
    value,
    "replace"
  )
}

function tsconfig(
  id: string,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace"
): Contribution {
  return {
    id,
    source: "preset:typescript",
    kind: "structured",
    path: "tsconfig.json",
    format: "json",
    address,
    value,
    update,
  }
}

function json(
  id: string,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace"
): Contribution {
  return {
    id,
    source: "preset:typescript",
    kind: "structured",
    path: "package.json",
    format: "json",
    address,
    value,
    update,
  }
}

function dependency(name: string, range: string): Contribution {
  return {
    id: `typescript:dependency:${name}`,
    source: "preset:typescript",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}

function script(name: string, command: string): Contribution {
  return {
    id: `typescript:script:${name}`,
    source: "preset:typescript",
    kind: "package-script",
    manifest: "package.json",
    name,
    command,
  }
}
