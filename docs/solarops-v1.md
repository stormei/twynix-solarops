# SolarOps v1 installation standard

The standard makes a ThingsBoard installation discoverable without vendor-specific device-name guesses. Existing device IDs and telemetry history are reused.

## Entity model

- A site is an ASSET with solaropsRole=site.
- Optional zone assets group buildings, roofs or electrical areas.
- Physical PV arrays are ASSETs with solaropsRole=pvArray.
- Inverters and measurement sources are DEVICEs with explicit roles.
- Optional grid meters, production meters, weather stations, gateways and site controllers declare their corresponding roles.
- PV strings are optional child assets. Module counts, ratings, MPPT inputs and orientation must be supplied from verified installation information.

Contains describes physical hierarchy. Feeds connects a PV array to an inverter. MeasuredBy binds a physical array asset to a separate measurement device. Drawing-only symbols and wires do not create any of these relations.

## Site attributes

A site declares these server attributes:

```json
{
  "solaropsSchemaVersion": "1.0.0",
  "solaropsRole": "site",
  "siteKey": "example-site",
  "timezone": "Europe/Oslo",
  "dataSourceKind": "physical"
}
```

Use a stable, installation-specific siteKey, an IANA timezone and an explicit physical/simulation source classification. Each member declares solaropsSchemaVersion, solaropsRole and a unique equipmentKey. An explicit role identifies inverter candidates; names and generic power keys do not.

## Telemetry mapping

Store solaropsTelemetryMapping as a JSON server attribute. Logical names refer to actual source keys and their source units. For example, this binding assumes the source Power measurement is in watts:

```json
{
  "acPower": {"key": "Power", "unit": "W"},
  "lifetimeEnergy": {"key": "EnergyTotal", "unit": "Wh"},
  "operatingState": {"key": "solaropsOperatingMode", "unit": ""},
  "rawOperatingState": {"key": "solaropsOperatingModeRaw", "unit": ""}
}
```

AC power is required for inverter monitoring. Other supported readings include DC power/voltage/current, energy, temperature, AC voltage/current/frequency, run feedback and fault status. Missing mappings stay missing. Saved mappings are configuration, not proof of fresh measurements.

Use solaropsStateMapping only for confirmed raw-code meanings. Normalised mode strings need no numeric lookup. See the inverter-mode contract for supported modes, raw diagnostics and the optional ThingsBoard transformation template. Device-profile adapters apply only to explicitly matching device/source profiles; simulator meanings must not be applied to physical equipment.

## Optional capabilities

A site controller can supply mapped aggregate power, energy, grid exchange and weather. A grid meter must have a confirmed export-positive convention. The implementation supports one selected site controller and one selected grid meter; ambiguous sources require correction before activation.

Set expectedIntervalMs and staleAfterMs to match the actual reporting contract. A connected WebSocket does not prove fresh device measurements. Event-driven state signals can retain older timestamps, which the app displays independently of communication status.

## Setup workflow

1. Configure TB_URL in .env and start the complete local app.
2. Test reachability and sign in using an authorised ThingsBoard account.
3. Select an existing compatible site or create a site from the minimal template.
4. Select existing inverter devices. Detected inverters appear first; bulk selection retains saved mappings and checks membership.
5. Verify source keys, units and current readings. Confirm optional energy-counter semantics.
6. Review and save the exact asset, metadata and relation changes.
7. Add arrays, meters, detailed topology and drawing elements later when verified information is available.

The wizard rejects conflicting roles, membership in another active installation, invalid keys/units and mixed physical/simulation selections. Compatibility checks retain warnings about missing optional capabilities rather than inventing equipment.

## Editing and recovery

Administrators can update the hierarchy, reuse additional devices and configure mappings in Installation Edit mode. A snapshot fingerprint and expiring save plan protect against concurrent changes. Save reviews show asset/device changes and relation additions/removals before any write.

Detach removes installation membership and links; it does not delete device entities or their time-series history. Archive records a private backup before unlinking the model. Reset clears the selected connection/setup state. Backups and audit records remain local and must be included in an appropriate operational backup procedure.

## Portable templates

metadata.schema.json documents the supported attributes. minimal-site.json supplies a generic initial template. The explicitly labelled twynix-solar.json simulation template is an example adapter fixture, not an installation imported automatically. Its device names and values are simulation examples and must be replaced or bound explicitly for another dataset.

The UI is the normal commissioning path. The optional commissioning script supports reviewed maintenance workflows and requires an authorised local session; it contains no credentials or live installation export.
