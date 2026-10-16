import { createServer } from "node:http"
import { schema } from "#gql"

export function createSchemaServer() {
  return createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" })
    response.end(schema)
  })
}
