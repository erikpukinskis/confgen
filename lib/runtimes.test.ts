import { RUNTIME_NAMES, RUNTIME_PATHS } from "./runtimes.js"
import { expect, test } from "vitest"

test("runtimes use their standard directories", () => {
  expect(RUNTIME_PATHS).toEqual({
    lib: "lib",
    app: "app",
    server: "server",
    client: "client",
    integration: "integration",
    gateway: "gateway",
    docs: "docs",
  })
  expect(Object.keys(RUNTIME_PATHS)).toEqual([...RUNTIME_NAMES])
})
