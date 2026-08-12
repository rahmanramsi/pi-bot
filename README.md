# Pi Bot

Local-first Electron MVP for the selected Agent Conversation Workspace. Planner, Researcher, and Coder are the primary navigation; each has its own read-only Pi session. Pi runs in the Electron main process through the Pi SDK; the renderer gets a narrow IPC bridge and never gets Node access.

## Run

```bash
npm install
npm run dev
```

For a production renderer build:

```bash
npm run build
```

Pi Bot uses the existing local Pi authentication and available models. If Pi has no authenticated model, the app shows an actionable error instead of opening a blank screen. Model requests still go to the selected provider; the SDK and session history are local to the device.

## MVP behavior

- Each agent has a persistent session, and its recent-chat history is available from the secondary History section in the sidebar. Sessions are stored by Pi's `SessionManager` under the local Pi session directory.
- The last workspace, model, and thinking preference are stored in Electron's user-data directory.
- Only `read`, `grep`, `find`, and `ls` are enabled. The app cannot write files or run shell commands.
- Select an agent to switch its conversation, use Change folder to point Pi at another local workspace, or New conversation to start a separate session for the active agent.

The scope and acceptance criteria live in [docs/mvp-spec.md](docs/mvp-spec.md).
