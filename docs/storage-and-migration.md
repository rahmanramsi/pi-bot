# Storage, migration, and recovery

Pi Bot keeps app-owned structured state in one SQLite database opened by the Electron main process:

```text
<Electron userData>/
├── pi-bot.sqlite       # source of truth for settings, agents, mappings, and sessions
├── pi-bot.sqlite-wal   # SQLite write-ahead log while the database is active
├── credentials.json    # separate provider credential file, mode 0600
└── agents/<agent-id>/  # app-owned workspaces and their AGENTS.md files
```

The database enables foreign keys, WAL journaling, `synchronous=NORMAL`, and a five-second busy timeout. Writes are synchronous and wrapped in `BEGIN IMMEDIATE` transactions. The schema version and legacy migration status are stored in `schema_meta`; applied schema steps are recorded in `schema_migrations`. A newer database version is rejected rather than opened by an older build. Older versions are upgraded in the same transaction as their schema changes.

The renderer receives state through the narrow preload bridge. It never opens SQLite and never receives the database path. Workspace-panel tabs, the active tab, panel open state, and panel width are stored in the `preferences` table through that bridge. Browser storage still uses its existing `persist:pi-bot-browser-*` partitions, and file operations remain constrained to the selected workspace.

## New installs

On a fresh install, `pi-bot.sqlite` is initialized with the default Assistant profile. Pi Bot does not create `settings.json` or app-owned session JSONL. A session is an SQLite row with its header and tree entries; the SDK `SessionManager` runs in memory and writes each appended entry to SQLite. Renderer panel preferences are also initialized in SQLite. `localStorage` is read only once for migrating those panel preferences from an existing install, and the legacy keys are removed only after the SQLite write succeeds.

`credentials.json` is intentionally unchanged. It remains separate from the database, is written with mode `0600`, and is never included in settings or session migration.

## Existing installs

Startup opens or creates the database, then runs the legacy migration before loading the renderer state:

1. Existing `.jsonl.pending` copies are recovered using the current entry-count rule. A pending copy must have a matching session id/header identity and a fully valid entry structure before it can supersede the original. A malformed, larger, or different-session pending copy is kept for a later retry.
2. `settings.json` is parsed, including pre-v2 settings and current-session mappings.
3. Session JSONL is discovered under the old app session directory and from paths recorded in legacy settings.
4. Every candidate is parsed strictly. The first entry must be a valid `session` header; every following current-format entry must be valid and have a unique id. Legitimate SDK version-1 and version-2 sessions are normalized by the Pi SessionManager before this current-format validation, including the v2 `hookMessage` to `custom` role change.
5. Valid sessions and mappings are imported with foreign-key and transaction boundaries. The entry count and stored header are checked before each import is accepted.
6. The migration marker is `complete` only when settings and every discovered session/pending source validate. Invalid or incomplete sources leave it `pending` so the next launch retries them.

Migration is idempotent: the legacy source path and session id are unique database keys. An already imported source is recognized by its canonical source path, so a retry does not delete/recreate its entries or erase entries appended directly to SQLite while a sibling source is still malformed. Duplicate source files are deduplicated only when their validated trees match; a longer validated prefix is preferred, while conflicting copies leave migration pending without overwriting the database. Legacy files are not deleted automatically. This keeps recovery possible while the database is being verified.

## Recovery and cleanup

The first user prompt is appended to SQLite before the provider response is complete. If the process stops during the response, the user entry and all completed tree entries remain available after restart; there is no pending JSONL write to race.

To clean up legacy data after a successful migration:

1. Quit Pi Bot and make a backup of `pi-bot.sqlite`, `settings.json`, and the old session directories.
2. Inspect `schema_meta` and confirm the `legacy-jsonl` marker is `complete`.
3. Confirm the expected agent/session counts and open a sample conversation per agent/workspace.
4. Only then remove the old `settings.json` and legacy `.jsonl`/`.jsonl.pending` copies from the backup-verified locations.

Deleting a session or agent also removes its SQLite workspace-panel preference rows. Browser partition data remains separate and is not removed by session cleanup.

Do not delete `credentials.json`, workspace files, or browser profile data as part of database cleanup.
