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

export const sortPackageJson = async (packageJson: PackageJson) => {
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
        if (Array.isArray(value)) {
          return value.sort() as unknown[]
        }
        const keys = Object.keys(value).sort()
        return rebuildObject(keys, value as Record<string, unknown>)
      }

      return value
    },
    2
  )

  /**
   * For some reason if we format this with prettier, we get a different output
   * than we do with the CLI. It will leave lines like "files": ["dist"] where
   * the CLI version of prettier will format that as:
   *
   *     "files": [
   *       "dist"
   *     ]
   *
   * Not sure why, it'd be worth an investigation and maybe a prettier PR. But
   * luckily the normal JSON.stringify(..., null, 2) is pretty close to what
   * prettier does on the CLI. We just have to add an extra newline at the end
   * of the file:
   */
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
