#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { compile, type CompilationProgress } from "./compile"
import { ConfgenError } from "./errors"
import { PRESET_NAMES } from "./presets/registry"
import { RUNTIME_NAMES, runtimePath } from "./runtimes"
import { createSystem } from "./system"
import { Command, CommanderError } from "commander"

type TextWriter = {
  write(data: string): void
}

export async function main(
  argv: readonly string[],
  cwd: string,
  stderr: TextWriter = process.stderr,
  stdout: TextWriter = process.stdout
): Promise<number> {
  let exitCode = 0
  let warnings: readonly string[] = []
  const program = new Command()
  program
    .name("confgen")
    .description("Compile selected Understory runtimes and presets.")
    .usage("runtimes=#runtime[,#runtime...] [preset...]")
    .argument(
      "[selection...]",
      "runtimes=#runtime[,#runtime...] followed by preset names"
    )
    .allowExcessArguments(false)
    .showHelpAfterError(false)
    .configureOutput({
      writeOut(text) {
        stdout.write(text)
      },
      writeErr(text) {
        stderr.write(text)
      },
    })
    .exitOverride()
    .addHelpText("after", formatSupportedSelection)
    .action(async (selection: string[]) => {
      try {
        await compile({
          selection,
          system: createSystem(cwd),
          onWarnings(nextWarnings) {
            warnings = nextWarnings
          },
          onProgress(progress) {
            writeProgress(stdout, progress)
          },
        })
      } catch (error) {
        const message =
          error instanceof ConfgenError
            ? error.message
            : error instanceof Error
            ? error.message
            : String(error)
        writeDiagnostics(stderr, message)
        exitCode = 1
      }
    })

  try {
    await program.parseAsync([...argv])
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode
    const message = error instanceof Error ? error.message : String(error)
    writeDiagnostics(stderr, message)
    exitCode = 1
  }
  if (warnings.length > 0) {
    const color =
      process.stderr.isTTY === true && process.env.NO_COLOR === undefined
    const yellow = color ? "\u001b[33m" : ""
    const reset = color ? "\u001b[39m" : ""
    stderr.write(`\n${yellow}Warnings:${reset}\n`)
    for (const warning of warnings)
      stderr.write(`  ${yellow}${warning}${reset}\n`)
  }
  return exitCode
}

const separator = "————————————————————————————————————————————————"

function writeProgress(
  stdout: TextWriter,
  progress: CompilationProgress
): void {
  if (progress.type === "start") {
    stdout.write(
      `${separator}\n👷 Running confgen@${version()}\n${separator}\n`
    )
    return
  }
  const description =
    progress.type === "write"
      ? "Updating file"
      : progress.type === "remove"
      ? "Removing file"
      : "Running command"
  const detail =
    progress.type === "run"
      ? [progress.executable, ...progress.args].join(" ")
      : progress.path
  stdout.write(`${separator}\n👷 ${description}\n   ${detail}\n`)
}

function version(): string {
  try {
    const value: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    )
    if (
      typeof value === "object" &&
      value !== null &&
      "version" in value &&
      typeof value.version === "string"
    )
      return value.version
  } catch {
    return "unknown"
  }
  return "unknown"
}

function formatSupportedSelection(): string {
  const lines = ["", "Runtimes:"]
  for (const runtime of RUNTIME_NAMES) {
    lines.push(`  #${runtime}  ${runtimePath(runtime)}/`)
  }
  lines.push("", "Presets:")
  for (const preset of PRESET_NAMES) {
    lines.push(`  ${preset}`)
  }
  lines.push("")
  return lines.join("\n")
}

function writeDiagnostics(stderr: TextWriter, message: string): void {
  for (const line of message.split("\n")) {
    if (line.length === 0) continue
    stderr.write(`confgen: ${line}\n`)
  }
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  if (entry === undefined) return false
  const candidates = [entry, resolve(entry)]
  try {
    candidates.push(realpathSync(entry))
  } catch {
    // The entry path can be a package-manager virtual path.
  }
  return candidates.some(
    (candidate) => import.meta.url === pathToFileURL(candidate).href
  )
}

if (isDirectExecution()) {
  process.exitCode = await main(process.argv, process.cwd())
}
