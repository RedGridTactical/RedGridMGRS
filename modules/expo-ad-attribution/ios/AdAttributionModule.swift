import ExpoModulesCore
import AdServices

/**
 * Apple Search Ads attribution token bridge.
 *
 * Exposes a single async method `getAttributionToken()` which calls
 * `AAAttribution.attributionToken()` from Apple's AdServices.framework
 * (iOS 14.3+). The returned JWT is opaque from JS — the JS side is
 * responsible for POSTing it to https://api-adservices.apple.com/api/v1/
 * to exchange for the attribution payload.
 *
 * The token is short-lived (~24h) and only valid for the device that
 * generated it. Apple guarantees the device's privacy: the token cannot
 * be tied back to a specific user without their developer account
 * matching the campaign's orgId.
 *
 * Errors:
 *   - "ATTRIBUTION_TOKEN_UNAVAILABLE" — iOS <14.3 or AdServices not linked
 *   - "ATTRIBUTION_TOKEN_FAILED" — Apple internal failure (rare)
 */
public class AdAttributionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AdAttribution")

    AsyncFunction("getAttributionToken") { () -> String in
      if #available(iOS 14.3, *) {
        do {
          let token = try AAAttribution.attributionToken()
          return token
        } catch {
          throw AttributionError.failed(reason: error.localizedDescription)
        }
      } else {
        throw AttributionError.unavailable
      }
    }

    AsyncFunction("isAvailable") { () -> Bool in
      if #available(iOS 14.3, *) { return true }
      return false
    }
  }
}

enum AttributionError: Error, CustomStringConvertible {
  case unavailable
  case failed(reason: String)

  var description: String {
    switch self {
    case .unavailable: return "ATTRIBUTION_TOKEN_UNAVAILABLE"
    case .failed(let reason): return "ATTRIBUTION_TOKEN_FAILED: \(reason)"
    }
  }
}
