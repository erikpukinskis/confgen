import { spawn } from "node:child_process"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"

export type RunResult = {
  status: number
  stdout: string
  stderr: string
}

/**
 * Filesystem and subprocess access for one project directory.
 * `run` takes an executable and argument list and does not invoke a shell.
 */
export type System = {
  readFile(path: string): Promise<string>
  writeFile(path: string, contents: string): Promise<void>
  removeFile(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  run(executable: string, args: readonly string[]): Promise<RunResult>
}

export function createSystem(cwd: string): System {
  const resolvePath = (path: string): string =>
    isAbsolute(path) ? path : join(cwd, path)

  return {
    readFile(path) {
      return readFile(resolvePath(path), "utf8")
    },
    async writeFile(path, contents) {
      const target = resolvePath(path)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, contents)
    },
    removeFile(path) {
      return rm(resolvePath(path), { force: true })
    },
    rename(from, to) {
      return renameFile(resolvePath(from), resolvePath(to))
    },
    run(executable, args) {
      return new Promise((resolveResult, reject) => {
        const child = spawn(executable, [...args], {
          cwd,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        })
        const stdoutStream = child.stdout
        const stderrStream = child.stderr
        if (stdoutStream === null || stderrStream === null) {
          child.kill()
          reject(new Error(`Could not capture output from ${executable}`))
          return
        }
        let stdout = ""
        let stderr = ""
        stdoutStream.setEncoding("utf8")
        stderrStream.setEncoding("utf8")
        stdoutStream.on("data", (chunk) => {
          stdout += textChunk(chunk)
        })
        stderrStream.on("data", (chunk) => {
          stderr += textChunk(chunk)
        })
        child.once("error", reject)
        child.once("exit", (code) => {
          resolveResult({ status: code ?? 1, stdout, stderr })
        })
      })
    },
  }
}

function renameFile(from: string, to: string): Promise<void> {
  return rename(from, to)
}

export function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  )
}

function textChunk(chunk: unknown): string {
  if (typeof chunk === "string") return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8")
  return String(chunk)
}
