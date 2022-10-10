import { execSync } from "child_process"
import { existsSync, readFileSync } from "fs"
import { outputFileSync } from "fs-extra"
import { join } from "path"
import { mkdirSync, rmSync } from "fs"

export type System = {
  silent: boolean

  run(command: string): { status: number | null }
  exists(path: string): boolean
  read(path: string): string
  write(path: string, contents: string | object): void
  addPackage(pkg: string, isDevOnly: boolean): void
}

export class RealSystem implements System {
  silent: boolean
  cwd: string | undefined

  constructor({ silent, cwd }: { silent: boolean; cwd?: string }) {
    this.silent = silent
    this.cwd = cwd
  }

  run(command: string) {
    try {
      execSync(`echo "$ ${command}" && ${command}`, {
        cwd: this.cwd,
        stdio: this.silent ? "ignore" : "inherit",
      })
      return { status: 0 }
    } catch (e: unknown) {
      if (isCommandFailure(e)) return { status: e.status }
      throw e
    }
  }
  join(path: string) {
    return this.cwd ? join(this.cwd, path) : path
  }
  exists(path: string) {
    return existsSync(this.join(path))
  }
  read(path: string) {
    return readFileSync(this.join(path)).toString()
  }
  write(path: string, contents: string | object) {
    outputFileSync(this.join(path), stringify(contents))
  }
  addPackage(pkg: string, isDevOnly: boolean) {
    const dashDev = isDevOnly ? "-D " : ""
    this.run(`yarn add ${dashDev}${pkg}`)
  }
}

type CommandFailure = Error & {
  status: number
}

const isCommandFailure = (e: unknown): e is CommandFailure => {
  return typeof (e as CommandFailure).status === "number"
}

export class MockSystem implements System {
  silent = true
  contentsByPath: Record<string, string> = {}

  run() {
    return { status: null }
  }
  exists(path: string) {
    return Boolean(this.contentsByPath[path])
  }
  read(path: string) {
    return this.contentsByPath[path]
  }
  write(path: string, contents: string | object) {
    this.contentsByPath[path] = stringify(contents)
  }
  addPackage(pkgStrings: string, isDevOnly: boolean) {
    if (!this.exists("package.json")) {
      this.write("package.json", "{}")
    }

    const packageJson = JSON.parse(this.read("package.json")) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const depsKey = isDevOnly ? "devDependencies" : "dependencies"
    if (!packageJson[depsKey]) packageJson[depsKey] = {}
    const deps = packageJson[depsKey] as Record<string, string>

    const pkgs = pkgStrings.split(" ")

    for (const pkg of pkgs) {
      const [name, version] = pkg.split("@")
      deps[name] = version || "*"
    }

    this.write("package.json", stringify(packageJson))
  }
}

const stringify = (contents: string | object) => {
  return typeof contents === "string"
    ? contents
    : JSON.stringify(contents, null, 2)
}

export class TestSystem extends RealSystem {
  root: string

  constructor({ silent = true }: { silent?: boolean } = {}) {
    const root = `/tmp/${randomFolder()}`
    console.info(`Creating test system in ${root}`)
    mkdirSync(root)
    super({ silent, cwd: root })
    this.root = root
  }

  cleanUp() {
    rmSync(this.root, { recursive: true })
  }
}

const randomFolder = () => {
  const [, number] = Math.random().toString().split(".")
  return `confgen-${number}`
}
