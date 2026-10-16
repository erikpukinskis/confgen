#!/usr/bin/env node
import { realpathSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { compile } from "./compile.js"
import { ConfgenError } from "./errors.js"
import { PRESET_NAMES } from "./presets/registry.js"
import { RUNTIME_NAMES, runtimePath } from "./runtimes.js"
import { createSystem } from "./system.js"
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
    return 1
  }
  return exitCode
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
