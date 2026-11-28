import { spawn } from "node:child_process"
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { dirname, isAbsolute, join } from "node:path"

export type RunOptions = {
  /** Directory to run in, resolved against the project directory. */
  cwd?: string
  /** Variables layered over the current environment. */
  env?: Readonly<Record<string, string | undefined>>
}

/**
 * A running (or finished) subprocess. `status`, `stdout`, and `stderr` update
 * as the process runs; `status` stays undefined until it exits.
 */
export type RunResult = {
  status: number | undefined
  stdout: string
  stderr: string
  /**
   * Resolves with the next unread line of stdout or stderr. Once the process
   * has exited and every line has been read, resolves with only the status.
   */
  next(): Promise<RunLine>
  waitForExit(): Promise<ExitedRunResult>
  /** Sends SIGTERM and resolves once the process exits. */
  stop(): Promise<void>
}

export type ExitedRunResult = RunResult & { status: number }

export type RunLine = {
  stdout?: string
  stderr?: string
  status: number | undefined
}

export class CommandError extends Error {
  readonly command: string
  readonly status: number
  readonly stdout: string
  readonly stderr: string

  constructor(
    command: string,
    result: { status: number; stdout: string; stderr: string },
  ) {
    super(
      [
        `Command failed: ${command}`,
        `exit status: ${result.status}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n"),
    )
    this.name = "CommandError"
    this.command = command
    this.status = result.status
    this.stdout = result.stdout
    this.stderr = result.stderr
  }
}

/**
 * Filesystem and subprocess access for one project directory.
 * `run` takes an executable and argument list and does not invoke a shell.
 */
export type System = {
  readFile(path: string): Promise<string>
  listFiles(path: string): Promise<readonly string[]>
  writeFile(path: string, contents: string): Promise<void>
  removeFile(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  run(
    executable: string,
    args: readonly string[],
    options?: RunOptions,
  ): RunResult
}

export function createSystem(cwd: string): System {
  const resolvePath = (path: string): string =>
    isAbsolute(path) ? path : join(cwd, path)

  return {
    readFile(path) {
      return readFile(resolvePath(path), "utf8")
    },
    async listFiles(path) {
      try {
        const entries = await readdir(resolvePath(path), {
          withFileTypes: true,
        })
        return entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
      } catch (error) {
        if (isMissingFile(error)) return []
        throw error
      }
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
    run(executable, args, options = {}) {
      return runProcess(executable, args, {
        ...options,
        cwd: resolvePath(options.cwd ?? "."),
      })
    },
  }
}

function runProcess(
  executable: string,
  args: readonly string[],
  options: RunOptions & { cwd: string },
): RunResult {
  const command = [executable, ...args].join(" ")
  const child = spawn(executable, [...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const stdoutStream = child.stdout
  const stderrStream = child.stderr
  if (stdoutStream === null || stderrStream === null) {
    child.kill()
    throw new Error(`Could not capture output from ${executable}`)
  }

  const unread: Omit<RunLine, "status">[] = []
  let listeners: (() => void)[] = []
  let closed = false
  let spawnError: Error | undefined
  const notify = () => {
    const waiting = listeners
    listeners = []
    for (const listener of waiting) listener()
  }
  const changed = () =>
    new Promise<void>((resolve) => {
      listeners.push(resolve)
    })
  const throwIfFailed = () => {
    if (spawnError !== undefined) throw spawnError
    if (!closed || result.status === 0) return
    throw new CommandError(command, {
      status: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    })
  }

  const stdoutLines = splitLines((line) => unread.push({ stdout: line }))
  const stderrLines = splitLines((line) => unread.push({ stderr: line }))
  stdoutStream.setEncoding("utf8")
  stderrStream.setEncoding("utf8")
  stdoutStream.on("data", (chunk) => {
    const text = textChunk(chunk)
    result.stdout += text
    stdoutLines.write(text)
    notify()
  })
  stderrStream.on("data", (chunk) => {
    const text = textChunk(chunk)
    result.stderr += text
    stderrLines.write(text)
    notify()
  })
  child.once("error", (error) => {
    spawnError = error
    notify()
  })
  child.once("close", (code) => {
    stdoutLines.flush()
    stderrLines.flush()
    result.status = code ?? 1
    closed = true
    notify()
  })

  const result: RunResult = {
    status: undefined,
    stdout: "",
    stderr: "",
    async next() {
      for (;;) {
        const line = unread.shift()
        if (line !== undefined) return { ...line, status: result.status }
        throwIfFailed()
        if (closed) return { status: result.status }
        await changed()
      }
    },
    async waitForExit() {
      while (!closed && spawnError === undefined) await changed()
      throwIfFailed()
      return { ...result, status: result.status ?? 1 }
    },
    async stop() {
      if (spawnError !== undefined) return
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = new Promise<void>((resolve) => {
        child.once("exit", () => resolve())
      })
      child.kill("SIGTERM")
      await exited
    },
  }
  return result
}

/** Buffers text chunks and reports each complete line without its newline. */
function splitLines(onLine: (line: string) => void): {
  write(text: string): void
  flush(): void
} {
  let partial = ""
  return {
    write(text) {
      const lines = `${partial}${text}`.split("\n")
      partial = lines.pop() ?? ""
      for (const line of lines) onLine(line)
    },
    flush() {
      if (partial === "") return
      onLine(partial)
      partial = ""
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
