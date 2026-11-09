# ThingsBoard integration

## Connection

Set TB_URL to the ThingsBoard HTTP(S) origin, including its port, in .env. Run npm start and open http://localhost:3300. The endpoint is not editable on the login page. Test connection performs a bounded, credential-free reachability check; it does not authenticate or validate installation compatibility.

Login uses the user's ThingsBoard account. Tokens stay in encrypted backend sessions, and browser requests use same-origin HTTP-only cookies. The configured origin must match the browser address. Re-login is required when the upstream token expires.

## REST contract

The integration uses ThingsBoard authentication, authorised asset/device inventory, server attributes, entity relationships, latest/historical telemetry and alarm reads. The exact endpoint and payload contract must be validated against the deployed ThingsBoard version. In particular, some versions use a separate /history suffix for time-series history; TB_HISTORY_PATH makes that distinction configurable.

Discovery follows explicit site/member roles and relationships. It does not assume that a device name identifies an inverter. Metadata validation checks schema version, roles, source provenance, units and supported mappings. Installation writes require administrator authority and a server-generated review.

## Live transport

The backend authenticates a ThingsBoard /api/ws connection and batches ENTITY_DATA subscriptions. Subscription keys include all mapped source keys and the device active attribute. Updates populate a latest-value cache; the browser receives snapshots through server-sent events. Source timestamps remain distinct from receive times.

Backoff and pings detect transport loss. REST supplies initial/history data and fallback reads. A transport reconnection does not rewrite old timestamps or prove that the upstream gateway is publishing.

## Measurements and state

Declare actual source units in solaropsTelemetryMapping. SolarOps converts explicitly supported units into its display model and retains missing/invalid/stale quality. Preserve original cumulative counters and clarify whether they are lifetime, daily or resettable. Negative reset intervals and long gaps do not become production energy.

Prefer vendor-specific normalisation in a ThingsBoard device-profile Rule Chain. Standard mode strings, original raw codes, boolean run/fault feedback and consistent numeric measurement units form the boundary. See inverter-mode-contract.md for the portable contract and transformation template. Unknown numeric codes do not acquire universal meanings in SolarOps.

Device activity, mode age, measurement freshness and backend transport health remain independent. A change-only publisher may leave an unchanged mode sample older than power readings. Configure reporting/heartbeat policies deliberately; do not make old measurements look fresh by replacing timestamps in the viewer.

## Data ownership and deployment

ThingsBoard retains telemetry history, device entities, installation assets, mappings and electrical relations. SolarOps .env contains local application settings, and .runtime contains encrypted sessions and private model/audit backups. Neither location belongs in Git or a static deployment archive.

The complete app runs through its backend; static hosting is a frontend preview only. For production, configure HTTPS, service supervision, persistent storage, backup/restore and the exact allowed application origin. Test operation against the intended ThingsBoard version, physical device profiles and device counts before commissioning.
