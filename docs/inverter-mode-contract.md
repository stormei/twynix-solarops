# Inverter operating mode and communication

ThingsBoard is the preferred normalisation boundary. Use a device-profile-specific Rule Chain to decode vendor/SunSpec codes, apply documented scaling, and emit stable telemetry types and units. Keep original fields and source timestamps. SolarOps does not assign universal numeric KACO meanings.

The mode telemetry must be a string: `mppt`, `sleep`, `standby`, `startup`, `throttled`, `fault`, `running`, `stopped` or `unknown`. Do not convert generic Running to MPPT, or Standby to Sleep, without evidence in the source contract. `active` remains ThingsBoard's separate device-communication attribute, not an inverter mode. Browser WebSocket/SSE connectivity is a third, independent indicator.

Recommended device server attributes:

```json
{
  "solaropsTelemetryMapping": {
    "operatingState": {"key": "solaropsOperatingMode", "unit": ""},
    "rawOperatingState": {"key": "solaropsOperatingModeRaw", "unit": ""},
    "acPower": {"key": "ACPower", "unit": "kW"}
  }
}
```

The power example assumes ACPower really is kW. If the Rule Chain outputs W, declare W; do not apply the conversion twice. Numeric telemetry should be numbers, run/fault flags booleans, and modes strings. SolarOps retains explicit unit conversion and validation as compatibility protections.

## Optional ThingsBoard transformation template

`templates/solarops-v1/thingsboard/normalize-inverter-mode.js` is a JavaScript Script Transformation node body for flat telemetry payloads. Select the correct raw key for the device profile. Enrich the message metadata with the device's `solaropsStateMapping` server attribute as JSON before this node. Link Success to the existing Save time series path and handle Failure explicitly. Test with captured payloads before installing it into a production Rule Chain. The template adds the normalised mode and a raw copy, retains original keys/metadata/message type, and does not generate mode samples for unrelated messages. It does not rewrite historical data. It has not been installed automatically in this instance.

Populate solaropsStateMapping only from confirmed manufacturer/device-profile documentation. The existing Twynix profile stays scoped to simulation and retains its verified meanings; its generic Running and Standby codes are not relabelled MPPT or Sleep.

## Compatibility mapping in SolarOps

For existing devices that still publish raw codes, open Installation → Edit → inverter → Properties → Operating mode mapping (also available in Configure inverter's telemetry step). Add verified raw code → mode entries, then review/save. This writes solaropsStateMapping on that ThingsBoard device; no history is deleted. Clearing a custom entry leaves an explicitly selected verified adapter profile active, if present. Normalised string values need no numeric lookup table.

Modes use their own source timestamp. A newer power, run-feedback or fault-clear sample cannot refresh an old mapped mode. A positive fault flag has priority and uses its own timestamp. Unmapped numeric codes remain visible in diagnostics; generic run feedback may only establish Running/Stopped. The HMI preserves last-reported mode with an explicit stale/missing marker, independently of device communication and AC power quality.
