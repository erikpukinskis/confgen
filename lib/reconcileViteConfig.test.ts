import type { ViteConfigItem } from "./contributions.js"
import { reconcileViteConfig } from "./reconcileViteConfig.js"
import { expect, test } from "vitest"

const reactImport: ViteConfigItem = {
  id: "import:react",
  source: "preset:react",
  kind: "import",
  module: "@vitejs/plugin-react",
  imported: { kind: "default" },
  preferredLocal: "react",
}

const reactPlugin: ViteConfigItem = {
  id: "plugin:react",
  source: "preset:react",
  kind: "plugin",
  importId: "import:react",
  arguments: [],
}

const port: ViteConfigItem = {
  id: "property:port",
  source: "preset:vite",
  kind: "property",
  path: ["server", "port"],
  value: "3000",
}

test("creates a config when the file is absent", () => {
  const result = reconcileViteConfig({
    path: "vite.config.ts",
    current: undefined,
    items: [reactImport, reactPlugin, port],
    priorItems: [],
  })

  expect(result.problems).toEqual([])
  const contents = result.contents ?? ""
  expect(contents).toContain('import react from "@vitejs/plugin-react"')
  expect(contents).toContain('import { defineConfig } from "vite"')
  expect(contents).toContain("plugins: [react()]")
  expect(contents).toContain("port: 3000")
  expect(contents).toContain("export default defineConfig(")
})

test("creates one object when properties share a parent", () => {
  const outDir: ViteConfigItem = {
    id: "property:out",
    source: "preset:vite",
    kind: "property",
    path: ["build", "outDir"],
    value: '"dist"',
  }
  const emptyOutDir: ViteConfigItem = {
    id: "property:empty",
    source: "preset:vite",
    kind: "property",
    path: ["build", "emptyOutDir"],
    value: "true",
  }
  const created = reconcileViteConfig({
    path: "vite.config.ts",
    current: undefined,
    items: [outDir, emptyOutDir],
    priorItems: [],
  })

  expect(created.problems).toEqual([])
  const contents = created.contents ?? ""
  const matches = contents.match(/build:/g)
  expect(matches === null ? 0 : matches.length).toBe(1)
  const again = reconcileViteConfig({
    path: "vite.config.ts",
    current: created.contents,
    items: [outDir, emptyOutDir],
    priorItems: [outDir, emptyOutDir],
  })
  expect(again.problems).toEqual([])
  expect(again.contents).toBe(created.contents)
})

test("keeps a second reconciliation unchanged", () => {
  const created = reconcileViteConfig({
    path: "vite.config.ts",
    current: undefined,
    items: [reactImport, reactPlugin, port],
    priorItems: [],
  })
  const again = reconcileViteConfig({
    path: "vite.config.ts",
    current: created.contents,
    items: [reactImport, reactPlugin, port],
    priorItems: [reactImport, reactPlugin, port],
  })

  expect(again.problems).toEqual([])
  expect(again.contents).toBe(created.contents)
})

test("preserves spreads, comments, unknown plugins, and properties", () => {
  const current = `import existing from "./existing"

export default defineConfig({
  // keep
  plugins: [...base, existing()],
  server: {
    host: true,
  },
})
`
  const result = reconcileViteConfig({
    path: "vite.config.ts",
    current,
    items: [reactImport, reactPlugin, port],
    priorItems: [],
  })

  expect(result.problems).toEqual([])
  const contents = result.contents ?? ""
  expect(contents).toContain("// keep")
  expect(contents).toContain("...base")
  expect(contents).toContain("existing()")
  expect(contents).toContain("host: true")
  expect(contents).toContain("react()")
  expect(contents).toContain("port: 3000")
})

test("replaces a recognized property value", () => {
  const current = `import { defineConfig } from "vite"

export default defineConfig({
  server: {
    port: 1,
  },
})
`
  const result = reconcileViteConfig({
    path: "vite.config.ts",
    current,
    items: [port],
    priorItems: [{ ...port, value: "1" }],
  })

  expect(result.problems).toEqual([])
  expect(result.contents).toContain("port: 3000")
  expect(result.contents).not.toContain("port: 1")
})

test("reports a binding collision before editing", () => {
  const current = `import vue from "vue"
import { defineConfig } from "vite"

export default defineConfig({})
`
  const result = reconcileViteConfig({
    path: "vite.config.ts",
    current,
    items: [{ ...reactImport, preferredLocal: "vue" }],
    priorItems: [],
  })

  expect(result.contents).toBeUndefined()
  expect(result.problems).toEqual([
    'vite.config.ts: binding "vue" is already declared.',
  ])
})

test("reports a conflicting import alias", () => {
  const current = `import plugin from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({})
`
  const result = reconcileViteConfig({
    path: "vite.config.ts",
    current,
    items: [reactImport],
    priorItems: [],
  })

  expect(result.contents).toBeUndefined()
  expect(result.problems[0]).toContain('contribution requires "react"')
})

test("rejects an unsupported root", () => {
  const result = reconcileViteConfig({
    path: "vite.config.js",
    current: "export default {}\n",
    items: [port],
    priorItems: [],
  })

  expect(result.contents).toBeUndefined()
  expect(result.problems[0]).toContain("export default defineConfig")
})

test("rejects invalid syntax", () => {
  const result = reconcileViteConfig({
    path: "vite.config.ts",
    current: "export default defineConfig({\n",
    items: [port],
    priorItems: [],
  })

  expect(result.contents).toBeUndefined()
  expect(result.problems.length).toBeGreaterThan(0)
})

test("rejects duplicate properties and ambiguous plugin calls", () => {
  const duplicate = reconcileViteConfig({
    path: "vite.config.ts",
    current: `import { defineConfig } from "vite"
export default defineConfig({ server: {}, server: {} })
`,
    items: [port],
    priorItems: [],
  })
  expect(duplicate.problems[0]).toContain('duplicate property "server"')

  const ambiguous = reconcileViteConfig({
    path: "vite.config.ts",
    current: `import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
export default defineConfig({ plugins: [react(), react()] })
`,
    items: [reactImport, reactPlugin],
    priorItems: [],
  })
  expect(ambiguous.problems[0]).toContain("more than once")
})

test("stops when an intermediate expression would be erased", () => {
  const current = `import { defineConfig } from "vite"

export default defineConfig({
  server: customServer(),
})
`
  const result = reconcileViteConfig({
    path: "vite.config.ts",
    current,
    items: [port],
    priorItems: [],
  })

  expect(result.contents).toBeUndefined()
  expect(result.problems[0]).toContain("server is not an object")
})

test("removes an unused managed import and keeps a referenced one", () => {
  const unused = reconcileViteConfig({
    path: "vite.config.ts",
    current: `import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
})
`,
    items: [],
    priorItems: [reactImport, reactPlugin],
  })
  expect(unused.problems).toEqual([])
  expect(unused.contents).not.toContain("@vitejs/plugin-react")
  expect(unused.contents).not.toContain("react()")

  const referenced = reconcileViteConfig({
    path: "vite.config.ts",
    current: `import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const keep = react
export default defineConfig({
  plugins: [react()],
})
`,
    items: [],
    priorItems: [reactImport, reactPlugin],
  })
  expect(referenced.problems).toEqual([])
  expect(referenced.contents).toContain('from "@vitejs/plugin-react"')
  expect(referenced.contents).toContain("const keep = react")
  expect(referenced.contents).not.toContain("react()")
})
