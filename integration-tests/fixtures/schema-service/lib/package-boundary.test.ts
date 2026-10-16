import { expect, test } from "vitest"
import { PublishPackage } from "@multiplayerdb/package-service-client"

test("loads the published Package Service client document", () => {
  expect(PublishPackage.kind).toBe("Document")
})
