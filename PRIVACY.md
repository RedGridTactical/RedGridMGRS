# Privacy Policy

Last updated: September 7, 2026. This document describes Red Grid MGRS 4.0.5; older store releases may have different map-download behavior.

## App data

Red Grid MGRS does not send Red Grid Tactical a feed of your location, waypoints, photos or app usage. There is no Red Grid account system, advertising, analytics or cloud sync.

The app requests foreground location access for coordinates, navigation and related field tools. Optional features use Bluetooth for radios or external receivers, camera/photo access for geostamping, and platform file or sharing interfaces for imports and exports. Permissions depend on your platform and the feature you choose.

## Local storage

The app stores settings, saved waypoints and lists, areas of operation, map data, purchase entitlement status, and configured team preferences and keys locally. Version 4.0.5 also stores active route progress and up to 10 local session summaries containing planned route points and manual confirmations. This is not a continuous location recording.

Compatible imported MBTiles data is stored locally. Use the app's available controls to remove saved lists, map data or a team key. Uninstalling normally removes app-local data, but exports, device backups and copies held by other apps or recipients must be managed separately.

## Sharing and radio features

Copy, export, photo and sharing features pass the selected information to your chosen destination. Optional Meshtastic features transmit data through a connected radio. Recipients and radios may retain that data. These workflows do not use Red Grid servers.

Team payloads can use AES-256-GCM with a shared team key. The active key is stored locally so the team can persist across restarts; leaving the team removes that app key. Encryption does not hide radio metadata such as sender identifiers or packet timing. Radio channel settings and optional position sharing also affect what is transmitted.

## Online services

Online maps use platform map services and map tile providers. Those providers may receive your IP address, requested map area or tile coordinates, and standard request information. Version 4.0.5 disables public-provider bulk downloads and supports compatible local MBTiles imports instead. Verify map coverage before going offline.

Apple StoreKit and Google Play Billing process purchases and restores. We do not receive your payment details. Subscription management happens through your store account settings.

The app does not embed third-party advertising, analytics or crash-reporting SDKs. Apple, Google or the operating system may provide store reports and technical diagnostics according to their policies and your device settings.

## Support and website

If you contact support, we receive the contact details and message you choose to send. The website contact form uses Formspree to forward those submissions; it is separate from the app. The [website privacy policy](https://redgridtactical.com/privacy) also covers the website and the retired Red Grid Link app.

## Children and changes

The app is not directed at children under 13. We do not knowingly collect information from children. Changes to this policy will be published with an updated date.

Questions: support@redgridtactical.com or [GitHub issues](https://github.com/RedGridTactical/RedGridMGRS/issues).
