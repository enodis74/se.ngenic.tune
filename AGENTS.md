# Project guide

## Structure

- This is a Homey SDK v3 app written in CommonJS JavaScript.
- `app.js` manages settings, polling and app-level Flow actions.
- `drivers/*/device.js` updates device capabilities; `driver.js` handles pairing.
- `lib/NgenicTunesClient.js` is the shared Ngenic API client. It imports node-fetch dynamically.
- Edit manifest sources in `.homeycompose/` and `drivers/*/*.compose.json`.
  The Homey CLI generates the root `app.json`; do not edit it directly.
- The Homey release version lives in `.homeycompose/app.json`, with release notes
  in `.homeychangelog.json`. The npm package version is separate.

## Verification

- Use Node.js 22 for local development and `npm ci` to install locked dependencies.
- `npm test` runs all offline tests.
- `npm run test:tune` checks missing measurements and continued device updates.
- `npm run test:diagnostics` checks the standalone diagnostic script.
- `npm run validate` runs Homey CLI validation at the publish level.
- Run relevant tests for behavioral changes and publish-level validation for
  release preparation. Tests use fake credentials and simulated responses;
  Tune tests need permission to listen on a loopback HTTP port.

## API and device behavior

- HTTP 204 has no JSON body. The client signals it with `NGENIC_NO_CONTENT`;
  callers that support missing data must handle that code explicitly.
- Missing Tune measurements and `hasValue: false` map to `null`, never zero.
  A numeric zero is valid. Continue updating independent Tune measurements when
  one is absent, and allow the value to recover on a later poll.
- Do not infer available data solely from `/types`: a listed type can lack values.
- Preserve capability IDs, Flow card IDs and stored device data compatibility.
- Preserve API polling limits; avoid introducing extra per-poll discovery calls.

## Diagnostics and packaging

- Extended API diagnostics belong in `scripts/diagnose-ngenic.js`; see its README.
- Do not log tokens, Authorization headers or raw response bodies in the app.
  JSON parser error messages can contain response data; use metadata-only errors.
- Never commit real credentials, customer identifiers in examples, or diagnostic
  reports. Keep test data synthetic and real reports under ignored `diagnostics/`.
- Keep scripts, tests, reports, `AGENTS.md` and workspace files out of the Homey
  package using `.homeyignore`. Keep reusable scripts and tests in version control.
