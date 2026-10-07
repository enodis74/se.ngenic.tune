# Ngenic Tune

Control your Ngenic Tune system from within Homey.

Integrate the Ngenic Tune sensors into Homey and use in automation flows.

To get started, you need to get an access token from the Ngenic Developer Portal (developer.ngenic.se).
 - Click on "GET ACCESS TOKEN"
 - Login with your Ngenic user account
 - Click on "GENERATE TOKEN"
 - Copy the generated access token and paste it into the Ngenic Tune Homey app settings
 - Tap "Save changes"

Please note that the outdoor sensor represent the heat pump's outdoor sensor, and hence might look different in reality compared to the one in the driver image (depending on the brand of the heat pump).

Sensor values are polled in a round-robin fashion, with one sensor being updated per minute, except for Track sensors that are polled every 45 seconds. This is because the Ngenic API has rate limiting per minute and per hour. Please note that the Ngenic system itself does not provide updated values more often than about every five minutes.

## Development

Use Node.js 22 and install dependencies with `npm ci`. Tests use Node's built-in
test runner and simulated API responses; no Homey or access token is required.
The Tune tests start a local HTTP server.

```sh
npm test
npm run test:tune
npm run test:diagnostics
npm run validate
```

`npm run validate` requires the Homey CLI and validates the app for publication.
The Homey app version is maintained in `.homeycompose/app.json`, with release
notes in `.homeychangelog.json`. Homey Compose generates the root `app.json`.

For API troubleshooting, use `npm run diagnose` and follow the
[diagnostic script instructions](scripts/README-diagnostics.md). Reports are
stored locally in `diagnostics/` and excluded from Git and the Homey app package.
The diagnostic script, tests and agent instructions are also excluded from the
Homey app package.
