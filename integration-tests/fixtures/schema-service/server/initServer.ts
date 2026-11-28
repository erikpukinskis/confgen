import { ApolloServer } from "@apollo/server"
import { expressMiddleware } from "@apollo/server/express4"
import cors from "cors"
import express from "express"
import { schema } from "#gql/index"
import * as Mutation from "#server/mutations/index"
import * as Query from "#server/queries/index"

export async function initServer() {
  const app = express()
  const apolloServer = new ApolloServer({
    typeDefs: schema,
    resolvers: {
      Query,
      ...(Object.keys(Mutation).length > 0 ? { Mutation } : {}),
    },
  })

  await apolloServer.start()

  app.get("/", (_, res) => {
    res.send("Hello, baseline")
  })

  app.get("/healthcheck", (_, res) => {
    res.send("ok")
  })

  app.use(
    "/api",
    cors(),
    express.json(),
    expressMiddleware(apolloServer, {
      context: () => Promise.resolve({}),
    }) as unknown as express.RequestHandler,
  )

  return { express: app, apollo: apolloServer }
}
