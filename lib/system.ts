import { execSync } from "child_process"
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { outputFileSync } from "fs-extra"

export type System = {
  silent: boolean

  run(
    command: string,
    out?: string[],
    silent?: boolean
  ): { status: number | null }
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

  run(command: string, out?: string[], silent?: boolean) {
    try {
      const result = execSync(`echo "$ ${command}" && ${command}`, {
        cwd: this.cwd,
        stdio: out ? "pipe" : silent || this.silent ? "ignore" : "inherit",
      })
      if (out) {
        const lines = result.toString().split("\n")
        out.push(...lines.slice(1, lines.length - 1))
      }
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
  write(path: string, contents: string) {
    outputFileSync(this.join(path), contents)
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
  write(path: string, contents: string) {
    this.contentsByPath[path] = contents
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

    this.write("package.json", JSON.stringify(packageJson, null, 2))
  }
}
export class TestSystem extends RealSystem {
  root: string

  constructor({ silent = true }: { silent?: boolean } = {}) {
    const root = `/tmp/${randomFolder()}`
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
