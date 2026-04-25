# Changelog

## [3.2.0] — 2026-04-24

### Changed

- **Stateless cron execution** — the HomeKit events cron job now runs with `sessionTarget: "isolated"`, giving each scheduled poll a fresh, throwaway context. This eliminates accumulated session state and reduces token usage compared to the previous persistent bound session.

- **Setup is now idempotent** — re-running `/setup-homekit` no longer creates a duplicate cron job. The setup skill looks up the existing `"HomeKit events"` job by name and updates it in place; only missing jobs are created. The cron config returned by `GET /api/setup` now includes a `name` field to enable this lookup.

- **`setup-homekit` skill shipped in setup bundle** — `GET /api/setup` now returns the `setup-homekit` skill itself as part of the `skills` array, so the skill is always refreshed to the latest version when setup is re-run.

### API — `GET /api/setup`

The cron config shape now includes `name` and `sessionTarget`:

```json
{
  "cron": {
    "name": "HomeKit events",
    "schedule": "* * * * *",
    "command": "/homekit-events",
    "sessionTarget": "isolated"
  }
}
```

The `skills` array now includes `setup-homekit` alongside `homekit-events`.
