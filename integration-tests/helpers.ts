import { spawn, type ChildProcess } from "node:child_process"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { z } from "zod"

const confgenRoot = fileURLToPath(new URL("..", import.meta.url))

const scenarioSchema = z.object({
  args: z.array(z.string().min(1)).min(1),
})

const manifestSchema = z
  .object({
    name: z.string().min(1),
  })
  .loose()

export type CommandResult = {
  status: number
  stdout: string
  stderr: string
}

export class CommandError extends Error {
  readonly command: string
  readonly status: number
  readonly stdout: string
  readonly stderr: string

  constructor(command: string, result: CommandResult) {
    super(
      [
        `Command failed: ${command}`,
        `exit status: ${result.status}`,
        `stdout:\n${result.stdout}`,
        `stderr:\n${result.stderr}`,
      ].join("\n")
    )
    this.name = "CommandError"
    this.command = command
    this.status = result.status
    this.stdout = result.stdout
    this.stderr = result.stderr
  }
}

export type PackedConfgen = {
  tarball: string
  cleanup(): Promise<void>
}

export type RunningProcess = {
  stdout: string
  stop(): Promise<void>
}

export type SyntheticProject = {
  directory: string
  run(
    executable: string,
    args: readonly string[],
    timeoutMs?: number
  ): Promise<CommandResult>
  start(
    executable: string,
    args: readonly string[],
    options: {
      ready: (stdout: string) => boolean
      timeoutMs?: number
      env?: Readonly<Record<string, string>>
    }
  ): Promise<RunningProcess>
  cleanup(): Promise<void>
}

/** Builds and packs Confgen once for the integration suite. */
export async function packConfgen(): Promise<PackedConfgen> {
  const directory = await mkdtemp(join(tmpdir(), "confgen-pack-"))
  const tarball = join(directory, "confgen.tgz")
  await runCollected({
    cwd: confgenRoot,
    executable: "yarn",
    args: ["pack", "--out", tarball],
    timeoutMs: 120_000,
    children: [],
  })
  return {
    tarball,
    async cleanup() {
      await rm(directory, { recursive: true, force: true })
    },
  }
}

/** Reads the fixture's scenario declaration. */
export async function readScenario(
  fixtureDirectory: string
): Promise<readonly string[]> {
  const text = await readFile(join(fixtureDirectory, "scenario.json"), "utf8")
  return scenarioSchema.parse(jsonUnknown(JSON.parse(text))).args
}

/**
 * Copies a fixture into a temporary Yarn 4 Plug'n'Play project and installs
 * the packed Confgen tarball.
 */
export async function createSyntheticProject(input: {
  tarball: string
  fixture: string
}): Promise<SyntheticProject> {
  const directory = await mkdtemp(join(tmpdir(), "confgen-synthetic-"))
  const project = openProject(directory)
  try {
    await cp(input.fixture, directory, { recursive: true })
    await ensurePackageManager(directory)
    await project.run("yarn", ["add", "--dev", input.tarball], 180_000)
    return project
  } catch (error) {
    await project.cleanup()
    throw error
  }
}

/** Port announced by the generated server's readiness line. */
export function readyPort(stdout: string): number {
  const matched = /ready http:\/\/127\.0\.0\.1:(\d+)/.exec(stdout)
  const digits = matched?.[1]
  if (digits === undefined) {
    throw new Error(`missing readiness port\n${stdout}`)
  }
  return z.number().int().nonnegative().max(65535).parse(Number(digits))
}

function openProject(directory: string): SyntheticProject {
  const children: ChildProcess[] = []
  return {
    directory,
    run(executable, args, timeoutMs = 120_000) {
      return runCollected({
        cwd: directory,
        executable,
        args,
        timeoutMs,
        children,
      })
    },
    start(executable, args, options) {
      return startCollected({
        cwd: directory,
        executable,
        args,
        timeoutMs: options.timeoutMs ?? 30_000,
        ready: (stdout) => options.ready(stdout),
        extraEnv: options.env,
        children,
      })
    },
    async cleanup() {
      await Promise.all(children.map((child) => stopAndWait(child)))
      await rm(directory, { recursive: true, force: true })
    },
  }
}

async function ensurePackageManager(directory: string): Promise<void> {
  const path = join(directory, "package.json")
  const text = await readFile(path, "utf8")
  manifestSchema.parse(jsonUnknown(JSON.parse(text)))
  const value = jsonUnknown(JSON.parse(text))
  if (!isRecord(value)) throw new Error("package.json must be an object")
  const next: Record<string, unknown> = {
    ...value,
    packageManager: "yarn@4.11.0",
  }
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`)
}

async function runCollected(input: {
  cwd: string
  executable: string
  args: readonly string[]
  timeoutMs: number
  children: ChildProcess[]
}): Promise<CommandResult> {
  const command = formatCommand(input.executable, input.args)
  const { child, done } = spawnCommand({
    cwd: input.cwd,
    executable: input.executable,
    args: input.args,
    timeoutMs: input.timeoutMs,
    extraEnv: undefined,
  })
  input.children.push(child)
  const result = await done
  if (result.status !== 0) throw new CommandError(command, result)
  return result
}

function startCollected(input: {
  cwd: string
  executable: string
  args: readonly string[]
  timeoutMs: number
  ready: (stdout: string) => boolean
  extraEnv: Readonly<Record<string, string>> | undefined
  children: ChildProcess[]
}): Promise<RunningProcess> {
  const command = formatCommand(input.executable, input.args)
  const { child, stdout, stderr, exited } = spawnCaptured({
    cwd: input.cwd,
    executable: input.executable,
    args: input.args,
    extraEnv: input.extraEnv,
  })
  input.children.push(child)
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      stopProcess(child)
      reject(
        new CommandError(command, {
          status: 124,
          stdout: stdout(),
          stderr: `${stderr()}timed out after ${input.timeoutMs}ms\n`,
        })
      )
    }, input.timeoutMs)
    const finishReady = () => {
      if (settled || !input.ready(stdout())) return
      settled = true
      clearTimeout(timer)
      resolve({
        stdout: stdout(),
        async stop() {
          stopProcess(child)
          await exited
        },
      })
    }
    child.stdout?.on("data", finishReady)
    child.once("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stopProcess(child)
      reject(error)
    })
    child.once("exit", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(
        new CommandError(command, {
          status: code ?? 1,
          stdout: stdout(),
          stderr: stderr(),
        })
      )
    })
    finishReady()
  })
}

function spawnCommand(input: {
  cwd: string
  executable: string
  args: readonly string[]
  timeoutMs: number
  extraEnv: Readonly<Record<string, string>> | undefined
}): { child: ChildProcess; done: Promise<CommandResult> } {
  const captured = spawnCaptured(input)
  const done = new Promise<CommandResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      stopProcess(captured.child)
      resolve({
        status: 124,
        stdout: captured.stdout(),
        stderr: `${captured.stderr()}timed out after ${input.timeoutMs}ms\n`,
      })
    }, input.timeoutMs)
    captured.child.once("error", (error) => {
      clearTimeout(timer)
      stopProcess(captured.child)
      reject(error)
    })
    captured.child.once("exit", (code) => {
      clearTimeout(timer)
      resolve({
        status: code ?? 1,
        stdout: captured.stdout(),
        stderr: captured.stderr(),
      })
    })
  })
  return { child: captured.child, done }
}

function spawnCaptured(input: {
  cwd: string
  executable: string
  args: readonly string[]
  extraEnv: Readonly<Record<string, string>> | undefined
}): {
  child: ChildProcess
  stdout: () => string
  stderr: () => string
  exited: Promise<void>
} {
  const child = spawn(input.executable, [...input.args], {
    cwd: input.cwd,
    env: commandEnv(input.extraEnv),
    detached: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  child.stdout?.on("data", (chunk: unknown) => {
    stdout += textChunk(chunk)
  })
  child.stderr?.on("data", (chunk: unknown) => {
    stderr += textChunk(chunk)
  })
  const exited = new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    child.once("exit", () => {
      resolve()
    })
  })
  const readStdout = () => stdout
  const readStderr = () => stderr
  return {
    child,
    stdout: readStdout,
    stderr: readStderr,
    exited,
  }
}

function commandEnv(
  extra: Readonly<Record<string, string>> | undefined
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  env.YARN_ENABLE_GLOBAL_CACHE = "true"
  env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
  if (extra === undefined) return env
  for (const key of Object.keys(extra)) {
    const value = extra[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

function formatCommand(executable: string, args: readonly string[]): string {
  return [executable, ...args].join(" ")
}

function stopProcess(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, "SIGTERM")
  } catch {
    try {
      child.kill("SIGTERM")
    } catch {
      // The process already exited.
    }
  }
}

async function stopAndWait(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  stopProcess(child)
  const exited = new Promise<void>((resolve) => {
    child.once("exit", () => {
      resolve()
    })
  })
  await Promise.race([
    exited,
    delay(2_000).then(() => {
      if (child.pid === undefined || child.exitCode !== null) return
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {
        try {
          child.kill("SIGKILL")
        } catch {
          // The process already exited.
        }
      }
    }),
  ])
  if (child.exitCode === null && child.signalCode === null) await exited
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function textChunk(chunk: unknown): string {
  if (typeof chunk === "string") return chunk
  if (chunk instanceof Uint8Array) return Buffer.from(chunk).toString("utf8")
  return String(chunk)
}

function jsonUnknown(value: unknown): unknown {
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
