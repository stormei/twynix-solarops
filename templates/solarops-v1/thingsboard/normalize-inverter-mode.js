// ThingsBoard Script Transformation node body (JavaScript, flat telemetry messages).
// Enrich metadata.solaropsStateMapping from this device's server attribute first.
// Set this key to the actual raw vendor key for this adapter.
var rawKey = 'OperatingState';
if (!Object.prototype.hasOwnProperty.call(msg, rawKey)) {
    return {msg: msg, metadata: metadata, msgType: msgType};
}
var mapping = metadata.solaropsStateMapping || '{}';
if (typeof mapping === 'string') mapping = JSON.parse(mapping);
var allowed = ['mppt', 'sleep', 'standby', 'startup', 'throttled', 'fault', 'unknown', 'running', 'stopped'];
var raw = msg[rawKey];
var key = String(raw);
if ((typeof raw === 'number' || typeof raw === 'string') && key.trim() !== '' && isFinite(Number(raw))) key = String(Number(raw));
var mode = Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : (typeof raw === 'string' && allowed.indexOf(raw) >= 0 ? raw : 'unknown');
if (allowed.indexOf(mode) < 0) mode = 'unknown';
// Add fields; never overwrite the original vendor telemetry.
var output = {};
Object.keys(msg).forEach(function(k) { output[k] = msg[k]; });
output.solaropsOperatingMode = mode;
output.solaropsOperatingModeRaw = raw;
return {msg: output, metadata: metadata, msgType: msgType};
