# homebridge-openclaw

[![verified-by-homebridge](https://img.shields.io/badge/homebridge-verified-blueviolet?color=%23491F59&style=for-the-badge&logoColor=%23FFFFFF&logo=homebridge)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

Homebridge plugin that exposes a simplified REST API so an [OpenClaw](https://docs.openclaw.ai) agent can list and control HomeKit devices.

### Requirements

- **homebridge-config-ui-x** installed (included in the official Docker image).
- Homebridge started with the **`-I`** (insecure) flag so the UI can read/write characteristics.

### Installation

```bash
npm install homebridge-openclaw
```

Or via **Homebridge Config UI X**: Plugins → search “openclaw” → Install.

### Minimum configuration

Add to your Homebridge `config.json` under **`platforms`**:

```json
{
  "platform": "OpenClawAPI",
  "name": "OpenClaw API"
}
```

That’s it. The plugin will:

- Detect the UI credentials automatically (reads `.uix-secrets` and `auth.json` from the filesystem).
- Generate a unique API token and save it to `.openclaw-token`.
- Listen on port 8899.

### Advanced configuration

```json
{
  "platform": "OpenClawAPI",
  "name": "OpenClaw API",
  "apiPort": 8899,
  "apiBind": "0.0.0.0",
  "token": "my-custom-token",
  "rateLimit": 100,
  "homebridgeUiUrl": "http://localhost:8581",
  "homebridgeUiUser": "admin",
  "homebridgeUiPass": "admin"
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiPort` | number | 8899 | REST server port |
| `apiBind` | string | `0.0.0.0` | Bind address (`127.0.0.1` = local only) |
| `token` | string | auto | Bearer token for OpenClaw API calls |
| `rateLimit` | number | 100 | Max requests per minute per IP |
| `homebridgeUiUrl` | string | `http://localhost:8581` | Config UI X URL (only if not default) |
| `homebridgeUiUser` | string | auto | UI username (only if auto-detection fails) |
| `homebridgeUiPass` | string | auto | UI password (only if auto-detection fails) |

### Security

**Internal auth (plugin → Config UI X)**  
The plugin reads Homebridge internal files (`.uix-secrets` and `auth.json`) to sign valid JWTs. **No username or password is required in `config.json`.**  
Only if those files are unavailable (e.g. non-Docker setups), `homebridgeUiUser` / `homebridgeUiPass` are used as fallback.

**API token (OpenClaw → plugin)**  
Resolved in this order:

1. **Environment variable** `OPENCLAW_HB_TOKEN` — ideal for Docker Compose / Kubernetes.
2. **File** `.openclaw-token` in Homebridge storage — ideal if OpenClaw has filesystem access (same NAS, shared volume).
3. **`token`** in `config.json` — manual fallback.
4. **Auto-generated** — if none of the above exist, a unique token is generated (HMAC of Homebridge secretKey), saved to `.openclaw-token`, and printed in the logs.

**Rate limiting**  
Default: 100 requests per minute per IP. Configurable via `rateLimit`.

### Getting the token for OpenClaw

**Option A: Read the file (recommended)**  
After first start, the token is in:

```
/var/lib/homebridge/.openclaw-token
```

If using Docker with a mounted volume (e.g. `/Volumes/docker/HomeBridge`):

```bash
cat /Volumes/docker/HomeBridge/.openclaw-token
```

**Option B: Check the logs**  
On first start, the token is printed in the Homebridge logs:

```
[homebridge-openclaw] ────────────────────────────────────────
[homebridge-openclaw] API Token: abc123...
[homebridge-openclaw] Configure this token in your OpenClaw agent.
[homebridge-openclaw] ────────────────────────────────────────
```

**Option C: Environment variable**  
In Docker Compose:

```yaml
environment:
  - OPENCLAW_HB_TOKEN=my-shared-token
```

Configure the same value in OpenClaw.

### REST API

Base URL: `http://<homebridge-ip>:8899`

All requests (except `/health`) require:

```
Authorization: Bearer <token>
```

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check |
| `/api/devices` | GET | Yes | List all devices |
| `/api/devices/type/<type>` | GET | Yes | List by type (e.g. `switch`, `lightbulb`) |
| `/api/devices/<id>` | GET | Yes | Device state |
| `/api/rooms` | GET | Yes | List learned rooms |
| `/api/rooms/<room>/devices` | GET | Yes | List devices in a learned room |
| `/api/devices/<id>/room` | POST | Yes | Assign or update a device room |
| `/api/devices/<id>/room` | DELETE | Yes | Remove a learned device room |
| `/api/rooms/learn` | POST | Yes | Learn multiple room assignments |
| `/api/devices/<id>/control` | POST | Yes | Control one device |
| `/api/devices/control` | POST | Yes | Control multiple devices |

**Health (no auth)**

```
GET /health
```

**Room learning**

Room assignments are learned metadata stored in Homebridge storage at:

```
/var/lib/homebridge/.openclaw-rooms.json
```

Room matching is case-insensitive when filtering devices by room name.

Device responses include a `room` field once learned:

```json
{
  "id": "xxx",
  "name": "Desk Lamp",
  "type": "lightbulb",
  "room": "Office"
}
```

Assign one device to a room:

```
POST /api/devices/<id>/room
Content-Type: application/json

{ "room": "Office" }
```

Remove a learned room from one device:

```
DELETE /api/devices/<id>/room
```

Learn several rooms at once:

```
POST /api/rooms/learn
Content-Type: application/json

{
  "devices": [
    { "id": "xxx", "room": "Office" },
    { "id": "yyy", "room": "Kitchen" }
  ]
}
```

Or group device IDs by room:

```json
{
  "rooms": {
    "Office": ["xxx", "zzz"],
    "Kitchen": ["yyy"]
  }
}
```

List learned rooms:

```
GET /api/rooms
```

Sample response:

```json
{
  "success": true,
  "count": 2,
  "rooms": [
    {
      "name": "Kitchen",
      "count": 1,
      "devices": [
        { "id": "yyy", "name": "Kitchen Light", "type": "lightbulb" }
      ]
    },
    {
      "name": "Office",
      "count": 2,
      "devices": [
        { "id": "xxx", "name": "Desk Lamp", "type": "lightbulb" },
        { "id": "zzz", "name": "Office Fan", "type": "fan" }
      ]
    }
  ]
}
```

List devices in a room:

```
GET /api/rooms/Office/devices
```

**Control one device**

```
POST /api/devices/<id>/control
Content-Type: application/json

{ "action": "on", "value": true }
```

**Control multiple devices**

```
POST /api/devices/control
Content-Type: application/json

{
  "devices": [
    { "id": "xxx", "action": "on", "value": true },
    { "id": "yyy", "action": "on", "value": false }
  ]
}
```

**Supported actions**

| Action | Value | Devices |
|--------|-------|---------|
| `on` / `power` | `true` / `false` | switch, lightbulb, outlet, fan |
| `brightness` / `dim` | 0–100 | lightbulb |
| `hue` | 0–360 | RGB lightbulb |
| `saturation` | 0–100 | RGB lightbulb |
| `color` | `{ "hue": 240, "saturation": 100 }` | RGB lightbulb |
| `colorTemperature` / `ct` | mired | lightbulb |
| `targetTemperature` / `temperature` | 10–35 | thermostat |
| `thermostatMode` / `mode` | `off` / `heat` / `cool` / `auto` | thermostat |
| `lock` | `true` / `false` | lock |
| `speed` / `rotationSpeed` | 0–100 | fan |
| `position` / `targetPosition` | 0–100 | blinds |
| `tilt` / `targetTilt` | -90 to 90 | blinds |
| `garageDoor` / `garage` | `true`=open / `false`=close | garage |

### Using from OpenClaw

Example with `exec` and `curl`:

```bash
# List devices
exec('curl -s -H "Authorization: Bearer TOKEN" http://HOMEBRIDGE_IP:8899/api/devices')

# Turn on a light
exec('curl -s -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" -d \'{"action":"on","value":true}\' http://HOMEBRIDGE_IP:8899/api/devices/DEVICE_ID/control')
```

### License

MIT — see [LICENSE](LICENSE).

