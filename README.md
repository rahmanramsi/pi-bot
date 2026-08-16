# Pi Bot

## Give your coding agents a place to work

Pi Bot is a native desktop workspace for Pi coding agents. Instead of juggling
terminal tabs, folders, and scattered chat histories, you get one focused place
to direct agents, see what they are doing, and return to work without losing
context.

![Pi Bot](public/branding/pi-bot-logo.png)

Pi Bot makes agent-assisted coding feel less like babysitting a terminal and
more like working with a capable teammate.

## Why Pi Bot

- **Keep every agent in its lane.** Give each agent its own instructions,
  workspace, model, and conversation history. Switch projects without asking an
  agent to rediscover everything.
- **Know what is happening while work gets done.** Follow streamed responses,
  tool activity, and reasoning details in a calm, readable timeline.
- **Pick up where you left off.** Pi Bot keeps sessions and app state locally in
  SQLite, so your previous work is there when you come back.
- **Bring your preferred provider.** Connect with an API key or OAuth, or
  optionally import credentials from an existing local Pi installation.
- **Keep the workspace in view.** Browse project files and open web pages from
  the workspace panel without leaving the conversation.

## Start in minutes

Install a current Node.js LTS release, then run:

```bash
npm ci
npm run dev
```

Pi Bot opens after the development server starts. On your first launch, connect
a supported model provider or import existing Pi credentials, choose a model,
and give your agent a workspace. You are ready to start a conversation.

Each worktree gets its own development server port and `.pi-bot/user-data`
directory automatically, so you can run `npm run dev` from multiple worktrees
at the same time.

## Build and package

```bash
npm run build       # type-check and build the renderer
npm run dist        # macOS Apple Silicon DMG
npm run dist:win    # Windows x64 installer
```

Build artifacts are written to `release/`.

## Development checks

```bash
npm test
npm run test:motion
npm run typecheck
npm run build
npm run verify:renderer
```

After creating a package, use `npm run smoke:packaged` to open the packaged app
and check that its renderer reaches the setup screen.

## Project structure

```text
src/                 React renderer and UI components
electron/            Electron main process, preload bridge, and local storage
tests/               Node-based regression tests
scripts/qa/          Renderer and interaction checks
build/               Application icons
```

The renderer talks to Electron through the `window.piBot` preload bridge. The
main process owns agent runtimes, provider authentication, workspace access,
and session persistence.

## Your data stays local

Pi Bot stores its app database, settings, agent workspaces, and credentials in
Electron's local app-data directory. Provider credentials are kept in a local
owner-only `credentials.json` file; they are not stored in macOS Keychain.

Deleting an agent can remove its Pi Bot sessions and app-owned workspace.
External workspace folders are never deleted by Pi Bot.

## License

[MIT](LICENSE)
