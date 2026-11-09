# Twynix SolarOps

Solar monitoring and installation modelling for ThingsBoard. SolarOps combines live inverter telemetry, an SVG/HMI workspace, quality-aware energy reports and a guided installation setup.

## Run the complete application

Requires Node.js 22.22.3+ or another version supported by Angular 22.

```sh
npm ci
npm start
```

Open **http://localhost:3300**. `npm start` builds the frontend and starts the Node backend on the same origin. Wait for the server's listening message; stop it with Ctrl+C.

On first launch, SolarOps creates a private `.env` from `.env.example` with a unique session secret. Set your ThingsBoard endpoint and restart:

```dotenv
TB_URL=http://your-thingsboard-server:8080
PORT=3300
APP_ORIGIN=http://localhost:3300
DEFAULT_LANGUAGE=en
DEFAULT_THEME=light
```

Use the exact `localhost:3300` address for sign-in. Test connection checks reachability without credentials. Then sign in with a ThingsBoard account, select or create a site, reuse existing inverter devices, verify telemetry mappings and review the changes before saving. No installation or device is imported automatically.

`npm run dev:frontend` is a frontend-only development preview on port 4200. Use `npm start` for the complete login and monitoring workflow.

## Features

- Live ThingsBoard WebSocket subscriptions distributed to the browser through server-sent events.
- Guided device discovery and setup using the SolarOps v1 asset/device standard.
- View/Edit HMI modes, electrical drawing symbols, mapped values, mini trends, AC/DC drawing connections, zoom/pan, snapping, grouping and undo/redo.
- Reviewed asset, mapping and relationship changes in ThingsBoard; devices and telemetry history are retained when equipment is detached.
- Separate inverter operating mode, communication status and measurement freshness, with raw state diagnostics.
- Site and inverter daily/monthly energy reports, coverage/gap flags and CSV/PDF export.
- English/Norwegian and light/dark themes through the user menu.

Drawing-only symbols and connections do not create physical equipment or ThingsBoard relations. Breaker positions, MPPT/string specifications and other unsupported details are not inferred. Missing and stale readings are explicit; backend failures do not substitute demonstration data.

## Configuration and access

`.env` holds the ThingsBoard endpoint, application defaults, selected-site connection defaults and editor preferences. It is never committed. Passwords are not stored; session tokens are encrypted under `.runtime/`. Installation assets, telemetry mappings and history belong in ThingsBoard.

Monitoring uses the signed-in user's ThingsBoard permissions. Installation writes require an authorised tenant administrator and a server-generated review. SolarOps does not expose physical equipment control commands or telemetry-history deletion.

For unattended deployment, run the backend under a service manager, use an HTTPS reverse proxy and set the matching `APP_ORIGIN`, `NODE_ENV=production` and a strong `SESSION_SECRET`. Persistent session storage, backups and ThingsBoard connectivity must be included in the deployment. The static hosted preview does not provide the backend or access to a private ThingsBoard network.

## Checks

```sh
npm test
npm run check:server
npm run build
npm run check:build
```

## Documentation

- [SolarOps v1 installation standard](docs/solarops-v1.md)
- [Inverter mode and normalisation contract](docs/inverter-mode-contract.md)
- [Architecture and integration status](docs/architecture.md)
- [ThingsBoard integration notes](docs/thingsboard-integration.md)

The repository contains application source, tests, generic templates and `.env.example`. Local credentials, customer installations, private sessions, audit backups, generated builds and hosting account bindings are excluded from the GitHub source export.
