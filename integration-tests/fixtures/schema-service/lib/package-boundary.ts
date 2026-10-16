import type { PackageServiceTestKit } from "@multiplayerdb/package-service/test"
import { PublishPackage } from "@multiplayerdb/package-service-client"

export type PackageBoundary = {
  testKit: PackageServiceTestKit
  publishOperation: typeof PublishPackage
}
