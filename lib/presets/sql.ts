import type { Contribution, ProduceContributions } from "../contributions.js"

/** SQL owns the source type contract and SQL transform dependency. */
export const contributions: ProduceContributions = () => [
    dependency("vite-plugin-sql", "0.1.0"),
    {
      id: "sql:declaration",
      source: "preset:sql",
      kind: "starter-file",
      path: "lib/migrations/sqlite.d.ts",
      contents: 'declare module "*.sql" {\n  const content: string\n  export default content\n}\n',
    },
]

function dependency(name: string, range: string): Contribution {
  return {
    id: `sql:dependency:${name}`,
    source: "preset:sql",
    kind: "dependency",
    manifest: "package.json",
    section: "devDependencies",
    package: name,
    range,
  }
}
