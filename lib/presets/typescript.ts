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
const COMPILER_OPTIONS: readonly (readonly [string, JsonValue])[] = [
  ["target", "ES2024"],
  ["module", "NodeNext"],
  ["moduleResolution", "NodeNext"],
  ["strict", true],
  ["noUncheckedIndexedAccess", true],
  ["exactOptionalPropertyTypes", true],
  ["verbatimModuleSyntax", true],
  ["skipLibCheck", true],
  ["types", ["node"]],
  ["noEmit", true],
]

export const contributions: ProduceContributions = (selection) => [
  dependency("typescript", "5.9.3"),
  dependency("@types/node", "24.19.2"),
  script("check:types", typecheckCommand(selection)),
  ...COMPILER_OPTIONS.map(([name, value]) => option(name, value)),
  tsconfig("typescript:include", ["include"], includePaths(selection), "merge"),
  ...importMaps(selection),
  ...clientProject(selection),
]

function typecheckCommand(selection: Selection): string {
  const command = "tsc --noEmit -p tsconfig.json"
  if (!selection.runtimes.includes("client")) return command
  return `${command} && tsc --noEmit -p tsconfig.client.json`
}

function includePaths(selection: Selection): string[] {
  const paths = selection.runtimes.flatMap((runtime) => {
    if (runtime === "client") return []
    return [`${runtimePath(runtime)}/**/*.ts`]
  })
  if (selection.presets.includes("graphql")) {
    paths.push("gql/*.ts", "gql/*.d.ts", "gql/_generated/**/*.ts")
  }
  return paths
}

function importMaps(selection: Selection): Contribution[] {
  const maps = selection.runtimes.flatMap((runtime) => {
    if (runtime === "client") return []
    return [importMap(runtime)]
  })
  if (!selection.presets.includes("graphql")) return maps
  maps.push(
    json(
      "typescript:import:gql",
      ["imports", "#gql"],
      "./gql/index.ts",
      "replace"
    ),
    json(
      "typescript:import:gql-star",
      ["imports", "#gql/*"],
      "./gql/*.ts",
      "replace"
    )
  )
  return maps
}

function importMap(runtime: RuntimeName): Contribution {
  return json(
    `typescript:import:${runtime}`,
    ["imports", `#${runtime}/*`],
    `./${runtimePath(runtime)}/*.ts`,
    "replace"
  )
}

function clientProject(selection: Selection): Contribution[] {
  if (!selection.runtimes.includes("client")) return []
  const options = COMPILER_OPTIONS.map(([name, value]) =>
    clientTsconfig(
      `typescript:client:${name}`,
      ["compilerOptions", name],
      value,
      "merge"
    )
  )
  return [
    ...options,
    clientTsconfig(
      "typescript:client:include",
      ["include"],
      clientInclude(selection),
      "merge"
    ),
  ]
}

function clientInclude(selection: Selection): string[] {
  const paths = ["client/**/*.ts"]
  if (selection.presets.includes("graphql")) paths.push("gql/client/**/*.ts")
  return paths
}

function option(
  name: string,
  value: JsonValue,
  preserveExisting = true
): Contribution {
  return tsconfig(
    `typescript:compiler:${name}`,
    ["compilerOptions", name],
    value,
    preserveExisting ? "merge" : "replace"
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

function clientTsconfig(
  id: string,
  address: StructuredAddress,
  value: JsonValue,
  update: "merge" | "replace"
): Contribution {
  return {
    id,
    source: "preset:typescript",
    kind: "structured",
    path: "tsconfig.client.json",
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
