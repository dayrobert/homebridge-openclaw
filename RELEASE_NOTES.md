# Release Notes

## 3.1.0

This release improves security, aligns the Homebridge platform naming, and updates the default API port.

### Highlights

- Switched API authentication from a single long-lived Bearer token to a bootstrap-plus-session flow.
- Added `POST /api/auth/session` for minting short-lived signed session tokens.
- Restricted operational API routes to session-token auth, while keeping `/api/setup` compatible with bootstrap or session auth.
- Renamed the Homebridge platform config values to `OpenClaw Gateway` and `OpenClawGateway`.
- Changed the default API port from `8899` to `8865`.
- Added `sessionTokenTtl` configuration to control session lifetime.

### Notes for Upgrading

- Update your Homebridge config to use:
  `platform: "OpenClawGateway"`
  `name: "OpenClaw Gateway"`
- If you relied on port `8899`, update clients and reverse proxies to `8865` or set `apiPort` explicitly.
- OpenClaw clients should now exchange the bootstrap token at `POST /api/auth/session` before calling normal API endpoints.
- Existing bootstrap token sources still work: environment variable, `.openclaw-token`, `config.json`, or auto-generated token.
