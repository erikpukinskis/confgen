import type { ViteConfigItem } from "./contributions.js"
import ts from "typescript"

export type ViteReconciliation = {
  /** Final source. Absent when the file should not exist. */
  contents?: string
  problems: readonly string[]
}

type SourceEdit = {
  start: number
  end: number
  text: string
  /** Comma-separated insertions at one position are combined in source order. */
  join?: "comma"
}

type ImportItem = Extract<ViteConfigItem, { kind: "import" }>
type PluginItem = Extract<ViteConfigItem, { kind: "plugin" }>
type PropertyItem = Extract<ViteConfigItem, { kind: "property" }>

/**
 * Reconciles one Vite config that is JavaScript or TypeScript with exactly one
 * `export default defineConfig({ ... })`. Edits are source-range replacements.
 */
export function reconcileViteConfig(input: {
  path: string
  current: string | undefined
  items: readonly ViteConfigItem[]
  priorItems: readonly ViteConfigItem[]
}): ViteReconciliation {
  const problems = itemProblems(input.path, input.items)
  if (problems.length > 0) return { problems }

  const removed = removedItems(input.items, input.priorItems)
  if (input.current === undefined) {
    if (input.items.length === 0) return { problems: [] }
    return {
      contents: formatSource(input.path, generateConfig(input.items)),
      problems: [],
    }
  }

  const parsed = parseConfig(input.path, input.current)
  if (
    parsed.problems.length > 0 ||
    parsed.sourceFile === undefined ||
    parsed.root === undefined
  ) {
    return { problems: parsed.problems }
  }

  const bindingProblems = importBindingProblems(
    input.path,
    parsed.sourceFile,
    input.items
  )
  if (bindingProblems.length > 0) return { problems: bindingProblems }

  const planned = planEdits(
    input.path,
    parsed.sourceFile,
    parsed.root,
    input.items,
    removed,
    new Set(input.priorItems.filter(isPluginItem).map((item) => item.id)),
    new Set(input.priorItems.filter(isPropertyItem).map((item) => item.id))
  )
  if (planned.problems.length > 0) return { problems: planned.problems }
  if (planned.edits.length === 0 && planned.removedImports.length === 0) {
    return { contents: input.current, problems: [] }
  }

  const edited = applyEdits(input.current, planned.edits)
  const withoutUnused = removeUnusedImports(
    input.path,
    edited,
    planned.removedImports
  )
  if (withoutUnused.problems.length > 0)
    return { problems: withoutUnused.problems }
  const next = withoutUnused.contents
  if (next === input.current) return { contents: input.current, problems: [] }
  return { contents: formatSource(input.path, next), problems: [] }
}

function itemProblems(
  path: string,
  items: readonly ViteConfigItem[]
): string[] {
  const problems: string[] = []
  const locals = new Set<string>()
  const imports = new Map<string, string>()
  const importIds = new Set<string>()
  const pluginImports = new Set<string>()
  const properties = new Set<string>()

  for (const item of items) {
    if (item.kind === "import") {
      importIds.add(item.id)
      if (locals.has(item.preferredLocal)) {
        problems.push(
          `${path}: Vite binding "${item.preferredLocal}" is declared more than once.`
        )
      }
      locals.add(item.preferredLocal)
      const key = importKey(item)
      const previous = imports.get(key)
      if (previous !== undefined && previous !== item.preferredLocal) {
        problems.push(
          `${path}: Vite import ${key} has locals "${previous}" and "${item.preferredLocal}".`
        )
      }
      imports.set(key, item.preferredLocal)
    }
    if (item.kind === "plugin") {
      if (pluginImports.has(item.importId)) {
        problems.push(
          `${path}: Vite plugin import "${item.importId}" is managed more than once.`
        )
      }
      pluginImports.add(item.importId)
    }
    if (item.kind === "property") {
      const key = item.path.join(".")
      if (properties.has(key)) {
        problems.push(
          `${path}: Vite property "${key}" is managed more than once.`
        )
      }
      properties.add(key)
      if (item.path.length === 0) {
        problems.push(`${path}: Vite property "${item.id}" has an empty path.`)
      }
    }
  }

  for (const item of items) {
    if (item.kind !== "plugin") continue
    if (!importIds.has(item.importId)) {
      problems.push(
        `${path}: Vite plugin "${item.id}" references unknown import "${item.importId}".`
      )
    }
  }
  return problems
}

function removedItems(
  items: readonly ViteConfigItem[],
  priorItems: readonly ViteConfigItem[]
): ViteConfigItem[] {
  const desired = new Set(items.map((item) => item.id))
  return priorItems.filter((item) => !desired.has(item.id))
}

function parseConfig(
  path: string,
  text: string
): {
  sourceFile?: ts.SourceFile
  root?: ts.ObjectLiteralExpression
  problems: string[]
} {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  )
  const syntax = syntaxProblems(path, sourceFile)
  if (syntax.length > 0) return { problems: syntax }

  const roots: ts.ObjectLiteralExpression[] = []
  for (const statement of sourceFile.statements) {
    if (!ts.isExportAssignment(statement)) continue
    const expression = unwrapExpression(statement.expression)
    if (!isDefineConfigObject(expression)) {
      return {
        problems: [
          `${path}: expected exactly one export default defineConfig({ ... }).`,
        ],
      }
    }
    const argument = expression.arguments[0]
    const unwrapped =
      argument === undefined ? undefined : unwrapExpression(argument)
    if (unwrapped !== undefined && ts.isObjectLiteralExpression(unwrapped)) {
      roots.push(unwrapped)
    }
  }
  if (roots.length !== 1) {
    return {
      problems: [
        `${path}: expected exactly one export default defineConfig({ ... }).`,
      ],
    }
  }
  const root = roots[0]
  if (root === undefined) {
    return {
      problems: [
        `${path}: expected exactly one export default defineConfig({ ... }).`,
      ],
    }
  }
  return { sourceFile, root, problems: [] }
}

function importBindingProblems(
  path: string,
  sourceFile: ts.SourceFile,
  items: readonly ViteConfigItem[]
): string[] {
  const problems: string[] = []
  const bindings = collectTopLevelBindings(sourceFile)
  for (const item of items) {
    if (item.kind !== "import") continue
    const existing = findImport(sourceFile, item)
    if (existing !== undefined && existing.local !== item.preferredLocal) {
      problems.push(
        `${path}: import ${importKey(item)} is bound to "${
          existing.local
        }" but the contribution requires "${item.preferredLocal}".`
      )
      continue
    }
    if (existing !== undefined) continue
    const binding = bindings.get(item.preferredLocal)
    if (binding !== undefined) {
      problems.push(
        `${path}: binding "${item.preferredLocal}" is already declared.`
      )
    }
  }
  return problems
}

function planEdits(
  path: string,
  sourceFile: ts.SourceFile,
  root: ts.ObjectLiteralExpression,
  items: readonly ViteConfigItem[],
  removed: readonly ViteConfigItem[],
  previouslyManagedPlugins: ReadonlySet<string>,
  previouslyManagedProperties: ReadonlySet<string>
): { edits: SourceEdit[]; removedImports: ImportItem[]; problems: string[] } {
  const problems: string[] = []
  const edits: SourceEdit[] = []
  const imports = items.filter(isImportItem)
  const plugins = items.filter(isPluginItem)
  const properties = items.filter(isPropertyItem)
  const removedPlugins = removed.filter(isPluginItem)
  const removedProperties = removed.filter(isPropertyItem)
  const removedImports = removed.filter(isImportItem)
  const locals = new Map<string, string>()
  for (const item of imports) locals.set(item.id, item.preferredLocal)
  for (const item of removed) {
    if (item.kind === "import") locals.set(item.id, item.preferredLocal)
  }

  const pluginPlan = planPlugins(
    path,
    sourceFile,
    root,
    plugins,
    removedPlugins,
    locals,
    previouslyManagedPlugins
  )
  problems.push(...pluginPlan.problems)
  edits.push(...pluginPlan.edits)

  const propertyPlan = planProperties(
    path,
    sourceFile,
    root,
    properties,
    removedProperties,
    previouslyManagedProperties
  )
  problems.push(...propertyPlan.problems)
  edits.push(...propertyPlan.edits)

  const importItems = [...imports]
  if (
    !hasDefineConfigImport(sourceFile) &&
    !collectTopLevelBindings(sourceFile).has("defineConfig")
  ) {
    importItems.push(defineConfigImport())
  }
  edits.push(...planImportInserts(sourceFile, importItems))

  return { edits, removedImports, problems }
}

function planPlugins(
  path: string,
  sourceFile: ts.SourceFile,
  root: ts.ObjectLiteralExpression,
  plugins: readonly PluginItem[],
  removed: readonly PluginItem[],
  locals: ReadonlyMap<string, string>,
  previouslyManagedPlugins: ReadonlySet<string>
): { edits: SourceEdit[]; problems: string[] } {
  const problems: string[] = []
  const edits: SourceEdit[] = []
  if (plugins.length === 0 && removed.length === 0) return { edits, problems }

  const found = findProperty(root, "plugins")
  if (found.kind === "duplicate" || found.kind === "ambiguous") {
    problems.push(`${path}: ${found.message}`)
    return { edits, problems }
  }
  if (found.kind === "method") {
    problems.push(
      `${path}: plugins is not a literal array, so managed plugin calls cannot be updated.`
    )
    return { edits, problems }
  }

  if (found.kind === "missing") {
    if (plugins.length === 0) return { edits, problems }
    const calls = plugins.map((plugin) =>
      pluginCall(
        locals.get(plugin.importId) ?? plugin.importId,
        plugin.arguments
      )
    )
    edits.push(insertProperty(root, `plugins: [${calls.join(", ")}]`))
    return { edits, problems }
  }

  const initializer = propertyInitializer(found.property)
  if (initializer === undefined || !ts.isArrayLiteralExpression(initializer)) {
    problems.push(
      `${path}: plugins is not a literal array, so managed plugin calls cannot be updated.`
    )
    return { edits, problems }
  }

  const managed = [...removed, ...plugins]
  for (const plugin of managed) {
    const local = locals.get(plugin.importId)
    if (local === undefined) {
      problems.push(
        `${path}: Vite plugin "${plugin.id}" references unknown import "${plugin.importId}".`
      )
      continue
    }
    const calls = callsNamed(initializer, local)
    if (calls.length > 1) {
      problems.push(
        `${path}: plugin "${local}" is called more than once in plugins.`
      )
      continue
    }
    const call = calls[0]
    const desired = plugins.find((item) => item.id === plugin.id)
    if (desired === undefined) {
      if (call !== undefined) edits.push(removeArrayElement(initializer, call))
      continue
    }
    const next = pluginCall(local, desired.arguments)
    if (call === undefined) {
      edits.push(insertArrayElement(initializer, next))
      continue
    }
    if (!previouslyManagedPlugins.has(desired.id)) continue
    if (sourceFile.text.slice(call.getStart(), call.getEnd()) !== next) {
      edits.push({ start: call.getStart(), end: call.getEnd(), text: next })
    }
  }
  return { edits, problems }
}

function planProperties(
  path: string,
  sourceFile: ts.SourceFile,
  root: ts.ObjectLiteralExpression,
  properties: readonly PropertyItem[],
  removed: readonly PropertyItem[],
  previouslyManagedProperties: ReadonlySet<string>
): { edits: SourceEdit[]; problems: string[] } {
  const problems: string[] = []
  const edits: SourceEdit[] = []
  for (const property of removed) {
    const result = planPropertyRemoval(path, root, property.path)
    problems.push(...result.problems)
    edits.push(...result.edits)
  }
  const grouped = groupMissingProperties(root, properties)
  edits.push(...grouped.edits)
  for (const property of properties) {
    if (grouped.ids.has(property.id)) continue
    const result = planPropertyWrite(
      path,
      sourceFile,
      root,
      property.path,
      property.value,
      previouslyManagedProperties.has(property.id)
    )
    problems.push(...result.problems)
    edits.push(...result.edits)
  }
  return { edits, problems }
}

function groupMissingProperties(
  root: ts.ObjectLiteralExpression,
  properties: readonly PropertyItem[]
): { edits: SourceEdit[]; ids: ReadonlySet<string> } {
  const groups = new Map<string, PropertyItem[]>()
  for (const property of properties) {
    const missing = firstMissingPath(root, property.path)
    if (missing === undefined || missing.index === property.path.length - 1)
      continue
    const key = missing.path.join(".")
    const group = groups.get(key) ?? []
    group.push(property)
    groups.set(key, group)
  }

  const edits: SourceEdit[] = []
  const ids = new Set<string>()
  for (const [key, group] of groups) {
    const path = key.split(".")
    const parent = objectAtPath(root, path.slice(0, -1))
    if (parent === undefined) continue
    const tree = new Map<string, unknown>()
    for (const property of group) {
      ids.add(property.id)
      insertTree(
        tree,
        property.path.slice(path.length),
        property.value
      )
    }
    edits.push(insertProperty(parent, `${path.at(-1)}: ${renderTree(tree)}`))
  }
  return { edits, ids }
}

function firstMissingPath(
  root: ts.ObjectLiteralExpression,
  path: readonly string[]
): { path: string[]; index: number } | undefined {
  let object = root
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index]
    if (segment === undefined) return undefined
    const found = findProperty(object, segment)
    if (found.kind === "missing") {
      return { path: path.slice(0, index + 1), index }
    }
    if (found.kind !== "property" || index === path.length - 1)
      return undefined
    const initializer = propertyInitializer(found.property)
    if (initializer === undefined || !ts.isObjectLiteralExpression(initializer))
      return undefined
    object = initializer
  }
  return undefined
}

function objectAtPath(
  root: ts.ObjectLiteralExpression,
  path: readonly string[]
): ts.ObjectLiteralExpression | undefined {
  let object = root
  for (const segment of path) {
    const found = findProperty(object, segment)
    if (found.kind !== "property") return undefined
    const initializer = propertyInitializer(found.property)
    if (initializer === undefined || !ts.isObjectLiteralExpression(initializer))
      return undefined
    object = initializer
  }
  return object
}

function insertTree(
  tree: Map<string, unknown>,
  path: readonly string[],
  value: string
): void {
  const head = path[0]
  if (head === undefined) return
  if (path.length === 1) {
    tree.set(head, value)
    return
  }
  const existing = tree.get(head)
  const nested = existing instanceof Map ? existing : new Map<string, unknown>()
  tree.set(head, nested)
  insertTree(nested, path.slice(1), value)
}

function renderTree(tree: Map<string, unknown>): string {
  const entries = [...tree].map(([key, value]) => {
    const rendered = value instanceof Map ? renderTree(value) : value
    return `${propertyKey(key)}: ${rendered}`
  })
  return `{ ${entries.join(", ")} }`
}

function propertyKey(value: string): string {
  return /^[$A-Z_a-z][$\\w]*$/.test(value) ? value : JSON.stringify(value)
}

function planPropertyRemoval(
  path: string,
  object: ts.ObjectLiteralExpression,
  propertyPath: readonly string[]
): { edits: SourceEdit[]; problems: string[] } {
  const head = propertyPath[0]
  if (head === undefined) return { edits: [], problems: [] }
  const found = findProperty(object, head)
  if (found.kind === "missing") return { edits: [], problems: [] }
  if (found.kind !== "property") {
    return {
      edits: [],
      problems: [
        `${path}: cannot remove ${propertyPath.join(".")} because ${
          found.message
        }`,
      ],
    }
  }
  if (propertyPath.length === 1) {
    return {
      edits: [removeProperty(object, found.property)],
      problems: [],
    }
  }
  const initializer = propertyInitializer(found.property)
  if (initializer === undefined || !ts.isObjectLiteralExpression(initializer)) {
    return {
      edits: [],
      problems: [
        `${path}: cannot remove ${propertyPath.join(
          "."
        )} because ${head} is not an object.`,
      ],
    }
  }
  return planPropertyRemoval(path, initializer, propertyPath.slice(1))
}

function planPropertyWrite(
  path: string,
  sourceFile: ts.SourceFile,
  object: ts.ObjectLiteralExpression,
  propertyPath: readonly string[],
  value: string,
  previouslyManaged: boolean
): { edits: SourceEdit[]; problems: string[] } {
  const head = propertyPath[0]
  if (head === undefined) {
    return { edits: [], problems: [`${path}: Vite property path is empty.`] }
  }
  const found = findProperty(object, head)
  if (
    found.kind === "duplicate" ||
    found.kind === "ambiguous" ||
    found.kind === "method"
  ) {
    return { edits: [], problems: [`${path}: ${found.message}`] }
  }
  if (propertyPath.length === 1) {
    if (found.kind === "missing") {
      return {
        edits: [insertProperty(object, `${head}: ${value}`)],
        problems: [],
      }
    }
    if (!previouslyManaged) return { edits: [], problems: [] }
    const initializer = propertyInitializer(found.property)
    if (initializer === undefined) {
      return {
        edits: [
          {
            start: found.property.getStart(),
            end: found.property.getEnd(),
            text: `${head}: ${value}`,
          },
        ],
        problems: [],
      }
    }
    if (
      sourceFile.text.slice(initializer.getStart(), initializer.getEnd()) ===
      value
    ) {
      return { edits: [], problems: [] }
    }
    return {
      edits: [
        {
          start: initializer.getStart(),
          end: initializer.getEnd(),
          text: value,
        },
      ],
      problems: [],
    }
  }
  if (found.kind === "missing") {
    return {
      edits: [insertProperty(object, nestedProperty(propertyPath, value))],
      problems: [],
    }
  }
  const initializer = propertyInitializer(found.property)
  if (initializer === undefined || !ts.isObjectLiteralExpression(initializer)) {
    return {
      edits: [],
      problems: [
        `${path}: property ${head} is not an object, so ${propertyPath.join(
          "."
        )} cannot be updated without removing existing behavior.`,
      ],
    }
  }
  return planPropertyWrite(
    path,
    sourceFile,
    initializer,
    propertyPath.slice(1),
    value,
    previouslyManaged
  )
}

function planImportInserts(
  sourceFile: ts.SourceFile,
  imports: readonly ImportItem[]
): SourceEdit[] {
  const missing = imports.filter(
    (item) => findImport(sourceFile, item) === undefined
  )
  if (missing.length === 0) return []
  const lines = missing.map(importLine).sort(compareText)
  const text = `${lines.join("\n")}\n`
  const existing = importDeclarations(sourceFile)
  const last = existing[existing.length - 1]
  if (last !== undefined) {
    return [
      {
        start: last.getEnd(),
        end: last.getEnd(),
        text: `\n${text.slice(0, -1)}`,
      },
    ]
  }
  const start = shebangEnd(sourceFile)
  return [{ start, end: start, text }]
}

function removeUnusedImports(
  path: string,
  source: string,
  removed: readonly ImportItem[]
): { contents: string; problems: string[] } {
  if (removed.length === 0) return { contents: source, problems: [] }
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  )
  const syntax = syntaxProblems(path, sourceFile)
  if (syntax.length > 0) return { contents: source, problems: syntax }
  const edits: SourceEdit[] = []
  for (const item of removed) {
    const existing = findImport(sourceFile, item)
    if (existing === undefined) continue
    if (bindingIsReferenced(sourceFile, existing.local)) continue
    const declaration = existing.declaration
    if (importBindingCount(declaration) <= 1) {
      edits.push(removeStatement(sourceFile, declaration))
      continue
    }
    if (ts.isImportSpecifier(existing.specifier)) {
      edits.push({
        start: existing.specifier.getStart(),
        end: specifierEnd(declaration, existing.specifier),
        text: "",
      })
    }
  }
  return { contents: applyEdits(source, edits), problems: [] }
}

function generateConfig(items: readonly ViteConfigItem[]): string {
  const imports = [defineConfigImport(), ...items.filter(isImportItem)]
  const unique = new Map<string, ImportItem>()
  for (const item of imports) unique.set(importKey(item), item)
  const importText = [...unique.values()]
    .map(importLine)
    .sort(compareText)
    .join("\n")
  const locals = new Map(
    items.filter(isImportItem).map((item) => [item.id, item.preferredLocal])
  )
  const plugins = items.filter(isPluginItem).map((plugin) => {
    const local = locals.get(plugin.importId) ?? plugin.importId
    return pluginCall(local, plugin.arguments)
  })
  const fields: string[] = []
  const pluginsText = printPlugins(plugins)
  if (pluginsText.length > 0) fields.push(pluginsText)
  const properties = printPropertyTree(
    propertyTree(items.filter(isPropertyItem)),
    1
  )
  if (properties.length > 0) fields.push(properties)
  const body = fields.length === 0 ? "" : `\n${fields.join("\n")}\n`
  return `${importText}\n\nexport default defineConfig({${body}})\n`
}

type PropertyNode = {
  value?: string
  children: Map<string, PropertyNode>
}

function propertyTree(
  properties: readonly PropertyItem[]
): Map<string, PropertyNode> {
  const root = new Map<string, PropertyNode>()
  for (const property of properties) {
    let level = root
    for (let index = 0; index < property.path.length; index += 1) {
      const name = property.path[index]
      if (name === undefined) continue
      const existing = level.get(name)
      const node = existing ?? { children: new Map<string, PropertyNode>() }
      if (index === property.path.length - 1) node.value = property.value
      level.set(name, node)
      level = node.children
    }
  }
  return root
}

function printPropertyTree(
  tree: Map<string, PropertyNode>,
  indent: number
): string {
  const pad = "  ".repeat(indent)
  const lines: string[] = []
  for (const [name, node] of tree) {
    if (node.children.size === 0) {
      const flat = `${pad}${name}: ${node.value ?? ""},`
      lines.push(flat)
      continue
    }
    const flatChild = flatPropertyNode(node)
    const flatLine = `${pad}${name}: ${flatChild},`
    if (flatLine.length <= 80) {
      lines.push(flatLine)
      continue
    }
    lines.push(
      `${pad}${name}: {\n${printPropertyTree(
        node.children,
        indent + 1
      )}\n${pad}},`
    )
  }
  return lines.join("\n")
}

function flatPropertyNode(node: PropertyNode): string {
  if (node.children.size === 0) return node.value ?? ""
  const fields: string[] = []
  for (const [name, child] of node.children) {
    fields.push(`${name}: ${flatPropertyNode(child)}`)
  }
  return `{ ${fields.join(", ")} }`
}

function defineConfigImport(): ImportItem {
  return {
    id: "vite:defineConfig",
    source: "preset:vite",
    kind: "import",
    module: "vite",
    imported: { kind: "named", name: "defineConfig" },
    preferredLocal: "defineConfig",
  }
}

function importLine(item: ImportItem): string {
  const specifier = JSON.stringify(item.module)
  if (item.imported.kind === "default") {
    return `import ${item.preferredLocal} from ${specifier}`
  }
  if (item.preferredLocal === item.imported.name) {
    return `import { ${item.imported.name} } from ${specifier}`
  }
  return `import { ${item.imported.name} as ${item.preferredLocal} } from ${specifier}`
}

function pluginCall(local: string, args: readonly string[]): string {
  return `${local}(${args.join(", ")})`
}

/** Keeps plugin lists inside Prettier's 80-column width. */
function printPlugins(calls: readonly string[]): string {
  if (calls.length === 0) return ""
  if (
    calls.length === 1 &&
    calls[0] !== undefined &&
    !calls[0].includes("\n") &&
    `  plugins: [${calls[0]}],`.length <= 80
  ) {
    return `  plugins: [${calls[0]}],`
  }
  const lines = calls.map((call) => {
    if (!call.includes("\n") && `    ${call},`.length <= 80)
      return `    ${call},`
    const [first, ...rest] = call.split("\n")
    const body = [`    ${first ?? ""}`, ...rest]
    const last = body.length - 1
    const ending = body[last]
    if (ending !== undefined) body[last] = `${ending},`
    return body.join("\n")
  })
  return `  plugins: [\n${lines.join("\n")}\n  ],`
}

function nestedProperty(
  propertyPath: readonly string[],
  value: string
): string {
  const leaf = propertyPath[propertyPath.length - 1]
  if (leaf === undefined) return value
  let text = `${leaf}: ${value}`
  for (let index = propertyPath.length - 2; index >= 0; index -= 1) {
    const name = propertyPath[index]
    if (name === undefined) continue
    text = `${name}: { ${text} }`
  }
  return text
}

function insertProperty(
  object: ts.ObjectLiteralExpression,
  text: string
): SourceEdit {
  const close = object.end - 1
  if (object.properties.length === 0) {
    return { start: close, end: close, text, join: "comma" }
  }
  const prefix = object.properties.hasTrailingComma ? " " : ", "
  return { start: close, end: close, text: `${prefix}${text}`, join: "comma" }
}

function insertArrayElement(
  array: ts.ArrayLiteralExpression,
  text: string
): SourceEdit {
  const close = array.end - 1
  if (array.elements.length === 0) {
    return { start: close, end: close, text, join: "comma" }
  }
  const prefix = array.elements.hasTrailingComma ? " " : ", "
  return { start: close, end: close, text: `${prefix}${text}`, join: "comma" }
}

function removeArrayElement(
  array: ts.ArrayLiteralExpression,
  element: ts.Expression
): SourceEdit {
  const index = array.elements.findIndex((entry) => entry === element)
  const next = array.elements[index + 1]
  const previous = index > 0 ? array.elements[index - 1] : undefined
  if (next !== undefined) {
    return { start: element.getStart(), end: next.getStart(), text: "" }
  }
  if (previous !== undefined) {
    return { start: previous.getEnd(), end: element.getEnd(), text: "" }
  }
  return { start: element.getStart(), end: element.getEnd(), text: "" }
}

function removeProperty(
  object: ts.ObjectLiteralExpression,
  property: ts.ObjectLiteralElement
): SourceEdit {
  const index = object.properties.findIndex((entry) => entry === property)
  const next = object.properties[index + 1]
  const previous = index > 0 ? object.properties[index - 1] : undefined
  if (next !== undefined) {
    return { start: property.getStart(), end: next.getStart(), text: "" }
  }
  if (previous !== undefined) {
    return { start: previous.getEnd(), end: property.getEnd(), text: "" }
  }
  return { start: property.getStart(), end: property.getEnd(), text: "" }
}

function removeStatement(
  sourceFile: ts.SourceFile,
  statement: ts.Statement
): SourceEdit {
  const start = statement.getFullStart()
  const end = statement.getEnd()
  const next = sourceFile.text[end] === "\n" ? end + 1 : end
  return { start, end: next, text: "" }
}

function specifierEnd(
  declaration: ts.ImportDeclaration,
  specifier: ts.ImportSpecifier
): number {
  const named = declaration.importClause?.namedBindings
  if (named === undefined || !ts.isNamedImports(named))
    return specifier.getEnd()
  const index = named.elements.findIndex((entry) => entry === specifier)
  const next = named.elements[index + 1]
  if (next !== undefined) return next.getStart()
  const previous = index > 0 ? named.elements[index - 1] : undefined
  if (previous !== undefined) return specifier.getEnd()
  return specifier.getEnd()
}

type FoundProperty =
  | { kind: "missing" }
  | { kind: "property"; property: ts.ObjectLiteralElement }
  | { kind: "duplicate"; message: string }
  | { kind: "method"; message: string }
  | { kind: "ambiguous"; message: string }

function findProperty(
  object: ts.ObjectLiteralExpression,
  name: string
): FoundProperty {
  const matches: ts.ObjectLiteralElement[] = []
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) continue
    if (ts.isComputedPropertyName(property.name)) {
      if (ts.isStringLiteral(property.name.expression)) {
        if (property.name.expression.text === name) matches.push(property)
        continue
      }
      return {
        kind: "ambiguous",
        message: `computed property in this object may conflict with "${name}".`,
      }
    }
    if (propertyNameText(property.name) === name) matches.push(property)
  }
  if (matches.length > 1) {
    return { kind: "duplicate", message: `duplicate property "${name}".` }
  }
  const match = matches[0]
  if (match === undefined) return { kind: "missing" }
  if (
    ts.isMethodDeclaration(match) ||
    ts.isGetAccessor(match) ||
    ts.isSetAccessor(match)
  ) {
    return {
      kind: "method",
      message: `property "${name}" is a method, so replacing it would remove executable behavior.`,
    }
  }
  return { kind: "property", property: match }
}

function propertyInitializer(
  property: ts.ObjectLiteralElement
): ts.Expression | undefined {
  if (ts.isPropertyAssignment(property))
    return unwrapExpression(property.initializer)
  if (ts.isShorthandPropertyAssignment(property)) return property.name
  return undefined
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text
  }
  return undefined
}

function callsNamed(
  array: ts.ArrayLiteralExpression,
  local: string
): ts.CallExpression[] {
  const calls: ts.CallExpression[] = []
  for (const element of array.elements) {
    const expression = unwrapExpression(element)
    if (!ts.isCallExpression(expression)) continue
    const callee = unwrapExpression(expression.expression)
    if (ts.isIdentifier(callee) && callee.text === local) calls.push(expression)
  }
  return calls
}

type FoundImport = {
  local: string
  declaration: ts.ImportDeclaration
  specifier: ts.ImportSpecifier | ts.Identifier
}

function findImport(
  sourceFile: ts.SourceFile,
  item: ImportItem
): FoundImport | undefined {
  for (const declaration of importDeclarations(sourceFile)) {
    const moduleName = moduleSpecifierText(declaration)
    if (moduleName !== item.module) continue
    const clause = declaration.importClause
    if (clause === undefined || clause.isTypeOnly) continue
    if (item.imported.kind === "default" && clause.name !== undefined) {
      return {
        local: clause.name.text,
        declaration,
        specifier: clause.name,
      }
    }
    const named = clause.namedBindings
    if (
      item.imported.kind !== "named" ||
      named === undefined ||
      !ts.isNamedImports(named)
    ) {
      continue
    }
    for (const specifier of named.elements) {
      if (specifier.isTypeOnly) continue
      const exported = specifier.propertyName?.text ?? specifier.name.text
      if (exported !== item.imported.name) continue
      return {
        local: specifier.name.text,
        declaration,
        specifier,
      }
    }
  }
  return undefined
}

function hasDefineConfigImport(sourceFile: ts.SourceFile): boolean {
  return findImport(sourceFile, defineConfigImport()) !== undefined
}

function importDeclarations(sourceFile: ts.SourceFile): ts.ImportDeclaration[] {
  return sourceFile.statements.filter(ts.isImportDeclaration)
}

function moduleSpecifierText(
  declaration: ts.ImportDeclaration
): string | undefined {
  const specifier = declaration.moduleSpecifier
  if (ts.isStringLiteral(specifier)) return specifier.text
  return undefined
}

function importBindingCount(declaration: ts.ImportDeclaration): number {
  const clause = declaration.importClause
  if (clause === undefined) return 0
  let count = clause.name === undefined ? 0 : 1
  const named = clause.namedBindings
  if (named !== undefined && ts.isNamedImports(named))
    count += named.elements.length
  if (named !== undefined && ts.isNamespaceImport(named)) count += 1
  return count
}

function collectTopLevelBindings(
  sourceFile: ts.SourceFile
): Map<string, ts.Node> {
  const names = new Map<string, ts.Node>()
  for (const statement of sourceFile.statements) {
    collectBindings(statement, names)
  }
  return names
}

function collectBindings(node: ts.Node, names: Map<string, ts.Node>): void {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause
    if (clause?.name !== undefined) names.set(clause.name.text, clause.name)
    const named = clause?.namedBindings
    if (named !== undefined && ts.isNamedImports(named)) {
      for (const specifier of named.elements)
        names.set(specifier.name.text, specifier.name)
    }
    if (named !== undefined && ts.isNamespaceImport(named)) {
      names.set(named.name.text, named.name)
    }
  }
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    names.set(node.name.text, node.name)
  }
  if (ts.isClassDeclaration(node) && node.name !== undefined) {
    names.set(node.name.text, node.name)
  }
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      collectName(declaration.name, names)
    }
  }
}

function collectName(name: ts.BindingName, names: Map<string, ts.Node>): void {
  if (ts.isIdentifier(name)) {
    names.set(name.text, name)
    return
  }
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) collectName(element.name, names)
  }
}

function bindingIsReferenced(
  sourceFile: ts.SourceFile,
  local: string
): boolean {
  let referenced = false
  const visit = (node: ts.Node): void => {
    if (referenced) return
    if (ts.isIdentifier(node) && node.text === local && !isImportLocal(node)) {
      referenced = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return referenced
}

function isImportLocal(node: ts.Identifier): boolean {
  const parent = node.parent
  if (ts.isImportClause(parent) && parent.name === node) return true
  if (ts.isImportSpecifier(parent) && parent.name === node) return true
  return false
}

function isDefineConfigObject(
  expression: ts.Expression
): expression is ts.CallExpression {
  if (!ts.isCallExpression(expression)) return false
  const callee = unwrapExpression(expression.expression)
  if (!ts.isIdentifier(callee) || callee.text !== "defineConfig") return false
  if (expression.arguments.length !== 1) return false
  const argument = expression.arguments[0]
  return (
    argument !== undefined &&
    ts.isObjectLiteralExpression(unwrapExpression(argument))
  )
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (ts.isParenthesizedExpression(current)) current = current.expression
  return current
}

function isImportItem(item: ViteConfigItem): item is ImportItem {
  return item.kind === "import"
}

function isPluginItem(item: ViteConfigItem): item is PluginItem {
  return item.kind === "plugin"
}

function isPropertyItem(item: ViteConfigItem): item is PropertyItem {
  return item.kind === "property"
}

function importKey(item: ImportItem): string {
  if (item.imported.kind === "default") return `${item.module} default`
  return `${item.module} named ${item.imported.name}`
}

function scriptKind(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
}

function shebangEnd(sourceFile: ts.SourceFile): number {
  const text = sourceFile.getFullText()
  if (!text.startsWith("#!")) return 0
  const newline = text.indexOf("\n")
  return newline < 0 ? text.length : newline + 1
}

function syntaxProblems(path: string, sourceFile: ts.SourceFile): string[] {
  const host = syntaxHost(sourceFile)
  const program = ts.createProgram([sourceFile.fileName], { noLib: true }, host)
  return program.getSyntacticDiagnostics(sourceFile).map((diagnostic) => {
    const message = diagnosticText(diagnostic)
    return `${path}: ${message}`
  })
}

function syntaxHost(sourceFile: ts.SourceFile): ts.CompilerHost {
  return {
    getSourceFile: (fileName) =>
      fileName === sourceFile.fileName ? sourceFile : undefined,
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => fileName === sourceFile.fileName,
    readFile: () => undefined,
  }
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  return message.length === 0 ? "invalid syntax." : message
}

function applyEdits(source: string, edits: readonly SourceEdit[]): string {
  const sorted = edits
    .slice()
    .sort((left, right) => left.start - right.start || left.end - right.end)
  const merged: SourceEdit[] = []
  for (const edit of sorted) {
    const last = merged[merged.length - 1]
    if (
      last !== undefined &&
      last.join === "comma" &&
      edit.join === "comma" &&
      last.start === last.end &&
      edit.start === edit.end &&
      last.start === edit.start
    ) {
      last.text = appendComma(last.text, edit.text)
      continue
    }
    merged.push({ ...edit })
  }
  const ordered = merged.sort(
    (left, right) => right.start - left.start || right.end - left.end
  )
  let next = source
  for (const edit of ordered) {
    next = next.slice(0, edit.start) + edit.text + next.slice(edit.end)
  }
  return next
}

function appendComma(left: string, right: string): string {
  if (left.length === 0) return right
  if (right.startsWith(",")) return `${left}${right}`
  return `${left}, ${right}`
}

/** Formats the edited source once. Unchanged files are not passed here. */
function formatSource(fileName: string, source: string): string {
  const host = formatHost(fileName, source)
  const service = ts.createLanguageService(host)
  const edits = service.getFormattingEditsForDocument(fileName, {
    indentSize: 2,
    tabSize: 2,
    convertTabsToSpaces: true,
    newLineCharacter: "\n",
    semicolons: ts.SemicolonPreference.Remove,
    insertSpaceAfterCommaDelimiter: true,
    insertSpaceAfterKeywordsInControlFlowStatements: true,
    insertSpaceBeforeAndAfterBinaryOperators: true,
  })
  const formatted = applyEdits(
    source,
    edits.map((edit) => ({
      start: edit.span.start,
      end: edit.span.start + edit.span.length,
      text: edit.newText,
    }))
  )
  if (formatted.endsWith("\n")) return formatted
  return `${formatted}\n`
}

function formatHost(fileName: string, source: string): ts.LanguageServiceHost {
  const snapshot = ts.ScriptSnapshot.fromString(source)
  return {
    getCompilationSettings: () => ({
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
    }),
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => "1",
    getScriptSnapshot: (name) => (name === fileName ? snapshot : undefined),
    getCurrentDirectory: () => "",
    getDefaultLibFileName: () => "lib.d.ts",
    fileExists: (name) => name === fileName,
    readFile: () => undefined,
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
