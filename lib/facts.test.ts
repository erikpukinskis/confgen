import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfgenError } from "./errors.js"
import { readProjectFacts } from "./facts.js"
import { createSystem, type System } from "./system.js"
import { expect, test } from "vitest"

test("reads identity, workspaces, repository, and registry from manifests", async () => {
  const system = await project()
  await system.writeFile(
    "package.json",
    JSON.stringify({
      name: "root",
      version: "1.2.3",
      private: true,
      repository: "https://github.com/example/root.git",
      workspaces: ["client"],
      publishConfig: {
        registry: "https://npm.pkg.github.com",
        access: "restricted",
      },
    })
  )
  await system.writeFile(
    "client/package.json",
    JSON.stringify({
      name: "@example/client",
      repository: {
        type: "git",
        url: "https://github.com/example/root.git",
        directory: "client",
      },
      publishConfig: { registry: "https://npm.pkg.github.com" },
    })
  )

  expect(await readProjectFacts(system)).toEqual({
    root: {
      path: "package.json",
      name: "root",
      version: "1.2.3",
      repository: {
        type: "git",
        url: "https://github.com/example/root.git",
      },
      workspaces: ["client"],
      dependencies: [],
      dependencyRanges: {
        dependencies: {},
        devDependencies: {},
        peerDependencies: {},
      },
      registry: "https://npm.pkg.github.com",
    },
    packages: [
      {
        path: "package.json",
        name: "root",
        version: "1.2.3",
        repository: {
          type: "git",
          url: "https://github.com/example/root.git",
        },
        workspaces: ["client"],
        dependencies: [],
        dependencyRanges: {
          dependencies: {},
          devDependencies: {},
          peerDependencies: {},
        },
        registry: "https://npm.pkg.github.com",
      },
      {
        path: "client/package.json",
        name: "@example/client",
        repository: {
          type: "git",
          url: "https://github.com/example/root.git",
        },
        workspaces: [],
        dependencies: [],
        dependencyRanges: {
          dependencies: {},
          devDependencies: {},
          peerDependencies: {},
        },
        registry: "https://npm.pkg.github.com",
      },
    ],
  })
})

test("reads a workspace package list object", async () => {
  const system = await project()
  await system.writeFile(
    "package.json",
    JSON.stringify({
      name: "root",
      workspaces: { packages: ["client"] },
    })
  )
  await system.writeFile(
    "client/package.json",
    JSON.stringify({ name: "@example/client" })
  )

  const facts = await readProjectFacts(system)
  expect(facts.root.workspaces).toEqual(["client"])
  expect(facts.packages.map((manifest) => manifest.name)).toEqual([
    "root",
    "@example/client",
  ])
})

test("detects the existing integration workflow filename", async () => {
  for (const extension of ["yml", "yaml"]) {
    const system = await project()
    await system.writeFile("package.json", JSON.stringify({ name: "root" }))
    const path = `.github/workflows/integration-tests.${extension}`
    await system.writeFile(path, "name: integration tests\n")

    expect((await readProjectFacts(system)).integrationWorkflowPath).toBe(path)
  }
})

test("reports every missing or invalid manifest field", async () => {
  const system = await project()
  await system.writeFile(
    "package.json",
    JSON.stringify({
      version: 1,
      repository: { url: "https://github.com/example/root.git" },
      workspaces: ["client", "docs"],
    })
  )
  await system.writeFile("client/package.json", "{")
  await system.writeFile(
    "docs/package.json",
    JSON.stringify({ name: "", version: "" })
  )

  expect((await factsError(system)).problems).toEqual([
    "package.json: name: Invalid input: expected string, received undefined",
    "package.json: version: Invalid input: expected string, received number",
    "package.json: repository.type: Invalid input: expected string, received undefined",
    "client/package.json: invalid JSON",
    "docs/package.json: name: Too small: expected string to have >=1 characters",
    "docs/package.json: version: Too small: expected string to have >=1 characters",
  ])
})

test("names the field when a manifest union has the wrong shape", async () => {
  const system = await project()
  await system.writeFile(
    "package.json",
    JSON.stringify({
      name: "root",
      repository: "",
      workspaces: { packages: [1] },
    })
  )

  expect((await factsError(system)).problems).toEqual([
    "package.json: repository: Too small: expected string to have >=1 characters",
    "package.json: workspaces.packages[0]: Invalid input: expected string, received number",
  ])
})

test("reports a workspace value that matches neither accepted shape", async () => {
  const system = await project()
  await system.writeFile(
    "package.json",
    JSON.stringify({ name: "root", workspaces: 1 })
  )

  expect((await factsError(system)).problems).toEqual([
    "package.json: workspaces: Invalid input: expected array or object, received number",
  ])
})

test("reports a missing manifest", async () => {
  const system = await project()
  await system.writeFile(
    "package.json",
    JSON.stringify({ name: "root", workspaces: ["client"] })
  )

  expect((await factsError(system)).problems).toEqual([
    "client/package.json: file is missing",
  ])
})

test("reports unsafe workspace paths and does not read them", async () => {
  const system = await project()
  await system.writeFile(
    "package.json",
    JSON.stringify({
      name: "root",
      workspaces: ["../outside", "/etc", "packages/*"],
    })
  )

  expect((await factsError(system)).problems).toEqual([
    "package.json: workspaces[0]: workspace path must be a relative directory inside the project.",
    "package.json: workspaces[1]: workspace path must be a relative directory inside the project.",
    'package.json: workspaces[2]: workspace globs are not supported ("packages/*").',
  ])
})

async function project(): Promise<System> {
  const cwd = await mkdtemp(join(tmpdir(), "confgen-facts-"))
  return createSystem(cwd)
}

async function factsError(system: System): Promise<ConfgenError> {
  try {
    await readProjectFacts(system)
  } catch (error) {
    if (error instanceof ConfgenError) return error
    throw error
  }
  throw new Error("Expected a manifest error")
}
