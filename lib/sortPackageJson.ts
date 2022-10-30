import sortBy from "lodash/sortBy"

type PackageJson = {
  name?: string
  version?: string
  license?: string
  repository?: {
    type: string
    url: string
  }
  main?: string
  module?: string
  bin?: string
  files?: string[]
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  resolutions?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

const KEY_ORDER = [
  "name",
  "version",
  "license",
  "repository",
  "main",
  "module",
  "bin",
  "files",
  "exports",
  "dependencies",
  "peerDependencies",
  "resolutions",
  "devDependencies",
  "scripts",
]

const KEYS_TO_SORT = [
  "dependencies",
  "peerDependencies",
  "resolutions",
  "devDependencies",
  "scripts",
  "files",
]

export const sortPackageJson = (packageJson: PackageJson) => {
  const valuesToSort = Object.entries(packageJson).reduce(
    (toSort, [key, value]) => {
      if (KEYS_TO_SORT.includes(key)) {
        return [...toSort, value]
      } else {
        return toSort
      }
    },
    [] as unknown[]
  )

  const json = JSON.stringify(
    packageJson,
    (key: string, value: unknown) => {
      if (!(value instanceof Object)) return value

      if (value === packageJson) {
        const keys = sortBy(Object.keys(packageJson), (key) =>
          KEY_ORDER.indexOf(key)
        ) as unknown as (keyof PackageJson)[]

        return rebuildObject(keys, value as Record<string, unknown>)
      } else if (valuesToSort.includes(value)) {
        const keys = Object.keys(value).sort()
        return rebuildObject(keys, value as Record<string, unknown>)
      }

      return value
    },
    2
  )

  return `${json}\n`
}

const rebuildObject = (keys: string[], object: Record<string, unknown>) => {
  return keys.reduce(
    (newObject, key) =>
      ({
        ...newObject,
        [key]: object[key],
      } as Record<string, unknown>),
    {} as Record<string, unknown>
  )
}
