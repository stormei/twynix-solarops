# SolarOps architecture

SolarOps is a ThingsBoard-backed monitoring application. The Node backend serves the Angular frontend and same-origin API. A static frontend preview cannot provide authentication, installation management or private-network access to ThingsBoard.

## Frontend

Angular standalone components use Signals, lazy routes, HttpClient, locally bundled ECharts and shared industrial styling. No external fonts or CDN assets are required. English/Norwegian translations and light/dark themes share the same controls. Application defaults and preferences persist in the local .env through the backend. Entity names and native alarm descriptions are not translated.

## Authentication and access

The backend authenticates with each user's ThingsBoard credentials. JWTs remain in encrypted server sessions with HTTP-only, strict SameSite cookies. Passwords are not persisted. Origin checks protect mutations, login is rate-limited, and upstream requests have timeouts. Monitoring is restricted by ThingsBoard permissions; installation writes require tenant-administrator authority and an expiring server-generated review.

Tokens expire with the upstream session. The current implementation supports re-login and a single backend instance; automatic token renewal and shared multi-instance session storage remain deployment work. HTTPS, service supervision and tested backups are required for unattended operation.

## Live data

One backend WebSocket per session subscribes to authorised device telemetry and activity attributes. Server-sent events distribute snapshots to the browser. The latest-value cache preserves source timestamps, retries connections with bounded backoff and retains historical datasets when live values update. REST supplies initial values, historical queries and fallback reads.

Transport connectivity, ThingsBoard device activity, inverter operating mode and measurement freshness are separate. Zero remains zero; missing values are not replaced with zero. Stale measurements remain visible with a quality marker and suppress live-flow animation. Unknown vendor codes require a verified mapping and remain visible in diagnostics.

## Installation model and editing

ThingsBoard owns site assets, physical PV arrays, equipment roles, telemetry mappings and relationships. The setup wizard reuses existing devices and presents a review before writing. Initial setup requires inverter AC power; optional energy and advanced equipment can be configured later.

Physical PV arrays are assets and may bind a separate measurement device. Contains describes hierarchy, Feeds describes explicit DC relationships, and MeasuredBy binds an array to its source. Removing equipment from the model retains the ThingsBoard entity and telemetry history.

Installation review uses a snapshot fingerprint to detect concurrent changes. Save receipts prevent duplicate operations, and private audit records identify completed steps if a save is interrupted. Archive/reset actions retain model backups and do not delete device history.

## SVG/HMI workspace

View mode hides mutation tools and opens live equipment details. Edit mode enables the equipment library, resizable panels, cursor-centred zoom, panning, selection, snapping, grouping, copy/paste, undo/redo and reviewed saving.

The version-1 diagram layout optionally stores bounded drawing elements and orthogonal AC/DC connections. Drawing symbols, labels, areas, meters and mini trends do not create physical assets or ThingsBoard relations. Breaker and isolator positions remain unknown without a verified position source. Live labels use mapped readings; mini trends preserve history gaps. PV Feeds relationships remain distinct from decorative wiring. Layout references are validated, remapped when new assets are saved and pruned when equipment is detached.

## Energy and reports

Calculations sort and deduplicate cumulative samples, reject invalid/reset intervals, handle configured rollover and exclude long gaps. Coverage and provenance accompany results. Calendar boundaries use the site timezone, including daylight-saving transitions. Incomplete site contributions are not silently omitted.

Daily/monthly reports share the calculation model used by monitoring. CSV exports preserve missing values, numeric precision, coverage, gaps and calculation provenance. PDF exports use a bounded report snapshot. No performance ratio, availability guarantee, forecast or financial result is fabricated from incomplete metadata.

## Configuration and deployment

.env contains the ThingsBoard endpoint, selected-site defaults and application preferences. It is excluded from source control. .runtime contains encrypted sessions, model backups and audit records and is also excluded. npm start builds the frontend, initialises a missing .env and launches the complete app on localhost:3300. The frontend-only development command uses port 4200.

See the installation standard and inverter-mode contract for portable metadata and transformation rules. Deployment credentials, customer configurations and historical commissioning notes are not part of the public source distribution.

## Validation and remaining work

The suite covers calculation quality, state decoding, device discovery, access checks, installation changes, layout validation, editor commands, configuration recovery and export behaviour. Build checks verify locally served assets and CSP-compatible stylesheet loading.

Remaining production work includes unattended deployment and recovery testing, automatic token renewal, shared session storage for multiple backend instances, notification workflows, broader physical-device commissioning, automated browser regression coverage and realistic load testing.
