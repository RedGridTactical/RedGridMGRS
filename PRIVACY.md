# Privacy Policy

Last updated: October 17, 2026. Persistent report worksheets and incident workspaces described below are available from Red Grid MGRS 4.1.2; older releases may retain those drafts only for a session.

## App data

Red Grid MGRS does not send Red Grid Tactical a feed of your location, waypoints, photos or app usage. There is no Red Grid account system, advertising, analytics or cloud sync.

The app requests foreground location access for coordinates, navigation and related field tools. Optional features use Bluetooth for radios or external receivers, camera/photo access for geostamping, and platform file or sharing interfaces for imports and exports. Permissions depend on your platform and the feature you choose.

## Local storage

The app stores settings, saved waypoints and lists, areas of operation, map data, purchase entitlement status and store transaction identifiers needed for restoration or verified revocation handling, and configured team preferences and keys locally. Active route progress and up to 10 local session summaries contain planned route points and manual confirmations. This is not a continuous location recording.

Report worksheet values and their location/time references, incident details and resources, ICS 214 activity entries and correction history, and unfinished incident/activity drafts are saved in a local database and survive app restarts after saving completes. Local previous-record and recovery copies may be retained to recover damaged records. Wait for the saved confirmation before closing. Saved incident records remain readable and exportable if Pro expires; they are not uploaded to Red Grid.

Calculator and tool input drafts are held in process-session memory until cleared or the app process ends. Saved settings and files produced by those tools are separate. Purchase-handling counters and review-prompt eligibility/history are stored locally and are not sent to us as usage analytics.

Compatible imported MBTiles data is stored locally. Use the app's available controls to clear report worksheets or delete archived incidents, saved lists, map data or a team key. Generated PDF/JSON files may remain in the app cache for system sharing; caches are not a secure-erasure guarantee. Uninstalling normally removes app-local data, but exports, device backups and copies held by other apps or recipients must be managed separately. Protect the device and exported files according to your organization's requirements; local storage alone is not a regulatory certification.

## Sharing and radio features

Copy, export, photo and sharing features pass the selected information to your chosen destination. Optional Meshtastic features transmit data through a connected radio. Recipients and radios may retain that data. These workflows do not use Red Grid servers.

Team payloads can use AES-256-GCM with a shared team key. The active key is stored locally so the team can persist across restarts; leaving the team removes that app key. Encryption does not hide radio metadata such as sender identifiers or packet timing. Radio channel settings and optional position sharing also affect what is transmitted.

## Online services

Online maps use platform map services and map tile providers. Those providers may receive your IP address, requested map area or tile coordinates, and standard request information. Current versions disable public-provider bulk downloads and support compatible local MBTiles imports instead. Verify map coverage before going offline.

Apple StoreKit and Google Play Billing process purchases and restores. We do not receive your payment-card or bank details. The app receives store entitlement/transaction information, and Apple or Google may make sales, subscription and other developer reports available under their policies. These reports do not give us a live feed of your in-app activity. Subscription management happens through your store account settings.

The app does not embed third-party advertising, analytics or crash-reporting SDKs. Apple, Google or the operating system may provide store reports and technical diagnostics according to their policies and your device settings.

## Support and website

If you contact support, we receive the contact details and message you choose to send. The website contact form uses Formspree to forward those submissions; it is separate from the app. The [website privacy policy](https://redgridtactical.com/privacy) also covers the website and the retired Red Grid Link app.

## Children and changes

The app is not directed at children under 13. We do not knowingly collect information from children. Changes to this policy will be published with an updated date.

Questions: support@redgridtactical.com or [GitHub issues](https://github.com/RedGridTactical/RedGridMGRS/issues).
