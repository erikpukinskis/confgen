import { readFileSync } from "node:fs"
import { createServer } from "node:https"
import { isAbsolute, join } from "node:path"
import { initServer } from "#server/initServer"

const HOST = "0.0.0.0"
const PORT = listenPort(process.env.PORT)

const SSL_PATH = process.env.SSL_PATH
if (SSL_PATH === undefined || !isAbsolute(SSL_PATH)) {
  throw new Error("SSL_PATH must be an absolute path")
}

void initServer()
  .then(({ express: app }) => {
    const server = createServer(
      {
        cert: readFileSync(join(SSL_PATH, "local.multiplayerdb.dev.crt")),
        key: readFileSync(join(SSL_PATH, "local.multiplayerdb.dev.key")),
      },
      app,
    )
    server.listen(PORT, HOST, () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        console.error("server did not bind to a port")
        process.exit(1)
      }
      console.log("ready https://127.0.0.1:" + String(address.port))
    })
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

function listenPort(value: string | undefined): number {
  if (value === undefined || value.length === 0) return 443
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return 443
  return port
}
