# Atomic Read-Only Backend

## Purpose

This module exposes bounded, read-only Atomic repository inspection to the web server. It is an OpenChamber-owned HTTP capability and does not proxy through OpenCode.

## Routes

- `GET /api/atomic/overview`: parsed working-copy status and local views.
- `GET /api/atomic/diff`: working-copy diff (`target=working` with optional repeated `path`) or recorded change diff (`target=change&change=<hash>`). `context` is optional.
- `GET /api/atomic/history`: summary history. Optional `view` and `limit` query parameters.
- `GET /api/atomic/change?change=<hash>`: one change in validated JSON form, including any AI attestation (vendor, model, tool, suggestion type, token usage, cost, session id, and metadata) normalized from the change's inline `provenance` object.
- `GET /api/atomic/provenance?change=<hash>`: the change's validated W3C PROV JSON-LD graph.

Every route resolves its repository from the standard project `directory` query handling. Paths must be repository-relative, view names and hashes use allowlisted character sets, `limit` is clamped to 1-100, and diff `context` is clamped to 0-20.

## CLI Boundary

`runtime.js` executes the external `atomic` executable with `execFile`, never a shell. Calls are serialized per repository in a process-wide queue because current Atomic databases reject concurrent opens. Each child has a 15 second timeout and 4 MiB stdout/stderr limit. The child environment forces no color, `RUST_LOG=off`, and a dumb terminal. CLI output is never logged or included in error responses.

Atomic currently emits text for `status` and `view list`, JSON for `log` and `change`, and JSON-LD for `provenance show`. All formats are parsed and validated at this boundary. History entries retain unavailable fields as `null`; response metadata explicitly lists incomplete `author`, `timestamp`, or `tagged` fields. Malformed or failed reads never become authoritative empty history. A change's inline `provenance` object is best-effort AI attestation telemetry: it is normalized field-by-field and any malformed or missing part degrades to `null` (or an empty metadata list) rather than failing the change read. Overview and provenance expose classified unavailable results for capability discovery; data operations return classified HTTP failures.

Stable runtime error codes distinguish a missing CLI, a non-Atomic directory, incompatible CLI/output, repository lock contention, timeout, output overflow, and other command failures.
