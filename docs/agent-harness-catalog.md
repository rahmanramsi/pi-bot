# Katalog Agent Harness

Snapshot riset: 13 Agustus 2026

Dokumen ini adalah katalog kerja untuk harness agent publik yang dapat menjalankan loop model → tool → hasil di komputer, repository, browser, atau workspace cloud. Isinya mencakup open source, source-available, dan proprietary/closed.

## Cara membaca katalog

- **Aktif:** ada produk, dokumentasi, rilis, atau layanan publik yang masih dipelihara pada snapshot ini.
- **Transitional:** masih dapat dipakai atau masih memiliki dokumentasi, tetapi ada sunset, penghentian pembuatan workspace, atau perubahan besar yang membuatnya bukan pilihan baru yang aman.
- **Maintenance-only:** masih tersedia, tetapi pemiliknya menyatakan pengembangan utamanya berhenti atau digantikan.
- **Archived/shutdown:** produk atau repository resminya sudah dihentikan.
- **Substrate:** menyediakan tool surface atau browser environment untuk host agent, tetapi tidak menjalankan loop agent lengkap sendiri.
- **Adjacent:** relevan untuk arsitektur, tetapi berada di batas scope.
- **Unknown:** tidak ditemukan bukti primer yang cukup dalam putaran riset ini. Unknown bukan berarti fiturnya pasti tidak ada.

## Batas scope

Yang masuk:

- CLI, TUI, desktop app, IDE/editor agent mode, cloud coding workspace, dan developer-usable computer-use runtime.
- Harness yang dapat membaca atau mengubah file, menjalankan command, mengoperasikan browser/desktop, mengelola sesi, atau mengorkestrasi tools.
- Produk yang modelnya open source, model-agnostic, provider-locked, atau tertutup.
- Browser-control runtime yang dapat dipakai oleh agent host, bila punya loop atau interface developer yang jelas.

Yang tidak menjadi entri utama:

- API/model mentah tanpa loop atau environment eksekusi.
- SDK/framework orchestration murni yang tidak merupakan runtime produk untuk menjalankan pekerjaan. Runtime SDK yang menyediakan loop, tool execution, guardrail, dan environment tetap dicatat sebagai developer runtime.
- Autocomplete atau chat-only tanpa kemampuan mengambil aksi.
- Browser automation library biasa tanpa agent interface.
- Assistant end-user yang tidak menyediakan harness developer yang dapat dikendalikan pengguna.
- Fork kecil, wrapper tipis, tool privat, atau proyek yang tidak memiliki bukti primer tentang aktivitas publiknya.

## Metode dan batas kelengkapan

- Roster dimulai dari kategori local/open source, CLI/TUI, IDE-integrated, cloud coding, app builder, dan computer-use/browser.
- Setiap klaim fitur ditautkan ke dokumentasi resmi, repository resmi, license file, release/changelog, atau halaman pricing milik vendor.
- Sumber komunitas dipakai hanya untuk menemukan kandidat; bukan bukti utama.
- Produk yang aktif, transitional, maintenance-only, dan archived dipisahkan.
- Kandidat yang overlap digabung bila sebenarnya satu engine dengan beberapa interface; varian yang memiliki permission, deployment, atau workflow berbeda tetap dipisah.
- Search pass berikutnya masih dapat menambah kandidat niche. Daftar kandidat yang belum cukup terverifikasi ada di bagian Watchlist dan exclusion log; hal itu membuat batas riset dapat diaudit tanpa mengisi fitur dengan tebakan.

## Field yang dicatat

Setiap entri mencatat:

- status, ownership, dan source posture;
- interface dan deployment;
- model/provider;
- built-in tools dan environment;
- MCP, plugin, skills, rules, hooks, atau extension;
- subagent, handoff, dan parallelism;
- memory, session, dan context;
- approval, permission, sandbox, atau isolation;
- Git, worktree, PR, atau deployment workflow;
- pricing/limits bila tersedia;
- sumber primer yang menjadi dasar ringkasan.

## Roster singkat

### Local dan open/source-available coding harness

- OpenHands
- OpenCode
- Goose
- Aider
- Cline
- Kilo Code
- mini-SWE-agent
- Pi coding agent
- Gemini CLI
- Qwen Code
- OpenAI Codex CLI
- Grok Build

### Proprietary, IDE, desktop, dan cloud coding harness

- Claude Code
- OpenAI Codex app/cloud
- Cursor
- Windsurf/Cascade
- GitHub Copilot coding agent
- GitHub Copilot CLI
- Devin
- Replit Agent
- Amazon Q Developer
- JetBrains Junie
- Sourcegraph Amp
- Factory Droid
- Augment Code/Auggie
- Warp Agent
- Kiro
- Gemini Code Assist agent mode
- Zed Agent
- Tabnine Agent

### Cloud app-builder dan deployment-oriented harness

- Lovable
- Bolt.new
- v0
- Firebase Studio
- Vercel Agent

### Browser dan computer-use runtime

- Browser Use
- Browser Harness
- Stagehand
- Microsoft Playwright MCP
- Skyvern
- OpenAI Agents SDK + ComputerTool
- Anthropic Computer Use Demo

## A. Local dan open/source-available coding harness

### 1. OpenHands

- **Status:** Aktif.
- **Ownership/source posture:** core repository open source; commercial/Enterprise components dan terms perlu dibedakan dari Community repository.
- **Interface/deployment:** web/Agent Canvas, CLI, SDK, Agent Server, local process, container, dan integrasi IDE melalui Agent Client Protocol.
- **Model/provider:** model-agnostic melalui LiteLLM dan profile/provider configuration; dokumentasi mencakup OpenAI-compatible, OpenRouter, local model, dan provider lain.
- **Tools/environment:** repository/file operations, terminal, editor, server startup, browser tooling, dan MCP tools.
- **MCP/extensions/skills:** MCP servers, agent skills, agent settings, dan file-based agent configurations.
- **Subagent/parallel:** agent profiles dan automation tersedia; detail parallelism berbeda menurut app, SDK, dan deployment sehingga perlu dibaca per versi.
- **Memory/context:** resume conversations, agent settings, skills, LLM profiles, dan persistent task/session state; long-term memory lintas task tidak dinyatakan seragam di semua deployment.
- **Permission/sandbox:** Docker sandbox direkomendasikan; process sandbox tersedia dengan peringatan keamanan; remote/cloud workspace dan Agent Server tersedia.
- **Git/workflow:** cocok untuk repository dan automated code review; detail Git orchestration khusus tidak selalu sama antar interface.
- **Pricing/limits:** local/self-host dapat memakai provider sendiri; OpenHands Cloud dan Enterprise memiliki pricing/terms terpisah.
- **Sumber:** [repository OpenHands](https://github.com/OpenHands/OpenHands), [documentation index](https://github.com/OpenHands/docs/blob/main/llms.txt), [sandbox overview](https://docs.openhands.dev/openhands/usage/sandboxes/overview), [MCP guide](https://docs.openhands.dev/sdk/guides/mcp).

### 2. OpenCode

- **Status:** Aktif.
- **Ownership/source posture:** open source dengan license MIT pada repository resminya.
- **Interface/deployment:** local CLI/TUI; dapat dipasang di IDE yang mendukung ACP; tersedia interactive TUI dan non-interactive run.
- **Model/provider:** provider-agnostic; provider hosted, self-hosted, dan OpenAI-compatible dapat dikonfigurasi.
- **Tools/environment:** read, edit, glob, grep, list, shell/bash, web fetch/search, LSP, task, dan custom tools.
- **MCP/extensions/skills:** MCP server dan custom tools; skill/agent configuration tersedia pada konfigurasi agent.
- **Subagent/parallel:** task/subagent tersedia; detail parallel execution dan batasnya harus diverifikasi pada versi CLI yang dipakai.
- **Memory/context:** session continuation, fork, project configuration, agent configuration, dan context management; persistent memory lintas session tidak dinyatakan sebagai fitur seragam.
- **Permission/sandbox:** permission dapat allow, ask, atau deny per tool dan resource; aturan bisa dibuat per agent dan per command. Sandbox deployment khusus tidak dinyatakan sebagai satu default universal.
- **Git/workflow:** dapat bekerja pada codebase Git dan session dapat dilanjutkan/fork; Git-native PR/worktree automation bukan fokus utama dokumentasi.
- **Pricing/limits:** local runtime gratis dari sisi harness; biaya mengikuti provider/model.
- **Sumber:** [repository OpenCode](https://github.com/opencode-ai/opencode), [agents](https://opencode.ai/docs/agents/), [CLI](https://dev.opencode.ai/docs/cli/), [providers](https://opencode.ai/v2/docs/providers), [MCP servers](https://opencode.ai/v2/docs/mcp-servers), [permissions](https://opencode.ai/v2/docs/permissions).

### 3. Goose

- **Status:** Aktif.
- **Ownership/source posture:** open source Apache-2.0; proyek berpindah ke Agentic AI Foundation.
- **Interface/deployment:** native desktop untuk macOS, Linux, dan Windows; CLI; API; CI; dan integrasi ACP.
- **Model/provider:** official site menyebut provider Anthropic, OpenAI, Google, Ollama, OpenRouter, Azure, Bedrock, dan provider lain; subscription provider tertentu dapat diakses lewat ACP.
- **Tools/environment:** file/repository operations, terminal, browser, database, API, GitHub, Google Drive, dan extension tools.
- **MCP/extensions/skills:** MCP adalah mekanisme extension utama; official site mendokumentasikan puluhan extension, skills marketplace, MCP Apps, recipes, subrecipes, dan prompt library.
- **Subagent/parallel:** dapat spawn subagent independen secara paralel untuk code review, research, dan file processing.
- **Memory/context:** recipes dan subrecipes memberi workflow yang dapat dipakai ulang; persistent memory lintas percakapan tidak didokumentasikan sebagai satu kontrak universal.
- **Permission/sandbox:** tool permission controls, sandbox mode, prompt-injection detection, dan adversary reviewer.
- **Git/workflow:** dapat dipakai untuk workflow repository; ACP memungkinkan Goose menjadi host atau provider bagi agent lain.
- **Pricing/limits:** desktop/CLI/API local-first; biaya model/provider atau layanan terhubung berlaku. Hosted Goose pricing tidak dinyatakan pada halaman yang diverifikasi.
- **Sumber:** [official site](https://block.github.io/goose/), [repository](https://github.com/block/goose), [provider docs](https://github.com/block/goose/blob/main/documentation/docs/getting-started/providers.md), [official documentation](https://block-goose.mintlify.app/).

### 4. Aider

- **Status:** Aktif dengan ritme rilis lebih lambat dibanding harness lain dalam roster ini.
- **Ownership/source posture:** open source; repository resmi menyediakan license file.
- **Interface/deployment:** terminal CLI; dapat dipakai di IDE melalui file watching dan komentar AI; dapat dijalankan di browser atau Codespaces menurut dokumentasi.
- **Model/provider:** banyak API provider dan model lokal; model dapat dipilih lewat konfigurasi CLI.
- **Tools/environment:** repository map, file reading/editing, in-chat commands, lint/test workflow, image/web-page input, dan operasi Git.
- **MCP/extensions/skills:** MCP dan plugin-style extensibility tidak terkonfirmasi dari sumber primer yang diperiksa.
- **Subagent/parallel:** Unknown.
- **Memory/context:** repository map, chat history, weak model untuk summarization, dan opsi batas history token; long-term memory lintas session tidak terkonfirmasi.
- **Permission/sandbox:** approval behavior dan auto-accept tersedia untuk mode tertentu; sandbox isolation khusus tidak terkonfirmasi.
- **Git/workflow:** Git adalah bagian penting dari workflow Aider; dokumentasi merekomendasikan bekerja di repository Git.
- **Pricing/limits:** local CLI; tidak ada hosted pricing utama yang diverifikasi.
- **Sumber:** [Aider documentation](https://aider.chat/docs/), [usage](https://aider.chat/docs/usage.html), [options](https://aider.chat/docs/config/options.html), [edit formats](https://aider.chat/docs/more/edit-formats.html), [repository](https://github.com/Aider-AI/aider).

### 5. Cline

- **Status:** Aktif.
- **Ownership/source posture:** open source Apache-2.0.
- **Interface/deployment:** VS Code-compatible extension, JetBrains plugin, headless/interactive CLI, Kanban task board, dan SDK.
- **Model/provider:** multi-provider; repository resmi mencantumkan Anthropic, OpenAI, Google, OpenRouter, Vercel AI Gateway, Bedrock, Vertex, Ollama, LM Studio, OpenAI-compatible endpoint, dan provider lain.
- **Tools/environment:** file read/write/edit, terminal/bash, URL/web fetch, browser, search, workspace checkpoints, dan JSON/headless automation.
- **MCP/extensions/skills:** MCP servers, .clinerules, skills, plugins, connectors, hooks, dan SDK-created custom tools.
- **Subagent/parallel:** experimental subagents untuk riset paralel; SDK menyediakan agent squad/background agents dan cross-agent handoff; nested subagent support terbatas.
- **Memory/context:** task/session history, checkpoints, workspace rules, SQLite session persistence pada SDK/core, dan context per agent.
- **Permission/sandbox:** user approval per tool, auto-approve modes, plan/act toggle, checkpoints/restore; sandbox detail bergantung pada host.
- **Git/workflow:** CLI headless untuk CI/CD, diff review, Kanban worktree per task, auto-commit pada Kanban, dan branch-level workflows.
- **Pricing/limits:** local IDE/CLI/SDK; biaya provider/model dan layanan Cline terkait perlu dicek per offering.
- **Sumber:** [repository Cline](https://github.com/cline/cline), [CLI overview](https://github.com/cline/cline/blob/main/docs/cline-cli/overview.mdx), [subagents](https://docs.cline.bot/features/subagents), [SDK README](https://github.com/cline/cline/blob/main/sdk/README.md).

### 6. Kilo Code

- **Status:** Aktif.
- **Ownership/source posture:** open source MIT pada repository resmi; platform hosted dan marketplace memiliki terms terpisah.
- **Interface/deployment:** VS Code extension dan CLI; konfigurasi dapat bersifat global, project-level, atau organization-managed.
- **Model/provider:** configurable provider/model profiles; exact provider matrix berubah dan tidak seluruhnya diringkas di satu halaman resmi.
- **Tools/environment:** read, glob, grep, list, edit/write, bash, web fetch/search, browser automation, question, task, plan, skill, dan MCP tools.
- **MCP/extensions/skills:** local STDIO dan remote HTTP/SSE MCP; Kilo Marketplace; agent skills; custom rules dan custom modes.
- **Subagent/parallel:** custom subagents dengan isolated session, prompt, model, tool access, dan permission; primary agent dapat mendelegasikan melalui Task atau mention.
- **Memory/context:** project/global config dan context terpisah untuk subagent; persistent long-term memory tidak dinyatakan sebagai kontrak umum.
- **Permission/sandbox:** allow/ask/deny per tool, command, dan agent; mode plan dapat read-only; sandbox detail bergantung extension/CLI configuration.
- **Git/workflow:** terminal dan read-only Git inspection tersedia; Git automation tingkat tinggi tidak menjadi fitur utama yang terverifikasi.
- **Pricing/limits:** local extension/CLI tersedia; Kilo cloud, gateway, dan Kilo Pass memakai pricing/usage terpisah.
- **Sumber:** [Kilo documentation](https://kilo.ai/docs), [repository](https://github.com/Kilo-Org/kilocode), [custom subagents](https://kilo.ai/docs/customize/custom-subagents), [custom modes](https://kilo.ai/docs/customize/custom-modes), [MCP](https://kilo.ai/docs/automate/mcp/using-in-kilo-code), [browser use](https://kilo.ai/docs/code-with-ai/features/browser-use).

### 7. mini-SWE-agent

- **Status:** Aktif.
- **Ownership/source posture:** open source project dari tim SWE-agent; ditujukan sebagai agent yang sangat kecil dan mudah dimodifikasi.
- **Interface/deployment:** CLI REPL, batch inference, Python bindings, dan run scripts.
- **Model/provider:** provider melalui LiteLLM, OpenRouter, Portkey, endpoint completion/response, serta local model configuration.
- **Tools/environment:** intentionally minimal; agent menggunakan bash sebagai tool utama, sehingga file editing, test, dan Git dilakukan melalui shell.
- **MCP/extensions/skills:** bukan fokus core; extensibility dilakukan melalui Python agent/environment/model classes dan config.
- **Subagent/parallel:** Unknown sebagai fitur core; batch execution dapat dijalankan terpisah.
- **Memory/context:** linear history, resumable global config, dan trajectory browser; long-term memory tidak dinyatakan sebagai fitur core.
- **Permission/sandbox:** confirm mode, yolo mode, human mode; mendukung local, Docker/Podman, Singularity/Apptainer, bubblewrap, dan environment lain.
- **Git/workflow:** kuat untuk issue/repository task dan benchmark; workflow GitHub tingkat tinggi tidak otomatis menjadi bagian dari core.
- **Pricing/limits:** local package; cost limit dan call limit tersedia; biaya model mengikuti provider.
- **Sumber:** [overview](https://mini-swe-agent.com/latest/), [quickstart](https://mini-swe-agent.com/latest/quickstart/), [CLI/modes](https://mini-swe-agent.com/latest/usage/mini/), [repository](https://github.com/SWE-agent/mini-swe-agent).

### 8. Pi coding agent

- **Status:** Aktif.
- **Ownership/source posture:** Pi core open source MIT dan provider-extensible; workspace ini memakai package @earendil-works/pi-coding-agent versi 0.84.1 sebagai runtime.
- **Interface/deployment:** terminal/TUI, Node.js SDK, RPC/integration path, dan dapat ditanam ke aplikasi seperti Pi Bot.
- **Model/provider:** official provider docs mencakup OpenAI/Codex, Anthropic, GitHub Copilot, xAI, OpenRouter, Ollama, Azure OpenAI, Bedrock, Vertex, Cloudflare AI, llama.cpp, dan custom providers.
- **Tools/environment:** file read/edit, shell/terminal, dan tool set yang dapat dipilih host; browser tidak menjadi core-first capability pada package inti yang diverifikasi.
- **MCP/extensions/skills:** core sengaja minimal; packages, extensions, skills, dan custom provider dapat menambah capability. MCP tidak diperlakukan sebagai core-first feature pada sumber yang diperiksa.
- **Subagent/parallel:** core tidak memaksakan orchestration; dapat ditambah lewat package/extension.
- **Memory/context:** sessions, branching, compaction, context usage, dan hooks; persistent memory lintas task bergantung package/host.
- **Permission/sandbox:** policy minimal pada core; guardrail dan permission dapat ditambahkan host/extension.
- **Git/workflow:** shell memberi akses Git; dedicated Git orchestration bukan fitur core yang terverifikasi.
- **Pricing/limits:** local npm/SDK/RPC; biaya mengikuti provider/model.
- **Bukti lokal:** dependency di [package.json](../package.json), runtime di [electron/main.mjs](../electron/main.mjs), dan bridge di [electron/preload.cjs](../electron/preload.cjs).
- **Sumber:** [Pi providers](https://pi.dev/docs/latest/providers), [Pi packages](https://pi.dev/packages), [repository](https://github.com/badlogic/pi-mono).

### 9. Gemini CLI

- **Status:** Aktif, dengan availability dan free-tier yang berubah menurut channel Google.
- **Ownership/source posture:** open source Apache-2.0.
- **Interface/deployment:** terminal CLI; editor integration, extension system, dan A2A/server path.
- **Model/provider:** Gemini models, Google authentication/API key, dan enterprise/API access; provider-agnostic model matrix bukan fokus utama.
- **Tools/environment:** file operations, search, shell, web/search-related tools, extensions, dan MCP.
- **MCP/extensions/skills:** MCP servers, extensions, skills, hooks, custom agents, dan configuration discovery.
- **Subagent/parallel:** specialized subagents dengan isolated context; A2A/remote subagent path; extension loading parallelism didokumentasikan.
- **Memory/context:** auto memory, project memory, skills, session rewind, dan context/session controls.
- **Permission/sandbox:** user confirmation untuk mutator, Plan Mode, approval modes, Auto Edit/YOLO, trusted folders, dan Docker sandbox; default sandbox dapat bergantung mode/config.
- **Git/workflow:** terminal/repository operations; GitHub-native PR orchestration tidak menjadi fokus core.
- **Pricing/limits:** local CLI; model/API dan Gemini Code Assist enterprise pricing berlaku. Channel consumer dan nama produk dapat berubah; cek official announcement sebelum memilihnya.
- **Sumber:** [repository](https://github.com/google-gemini/gemini-cli), [tools reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/tools.md), [configuration/sandbox](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md), [changelog](https://github.com/google-gemini/gemini-cli/blob/main/docs/changelogs/index.md).

### 10. Qwen Code

- **Status:** Aktif.
- **Ownership/source posture:** open source Apache-2.0 pada repository resmi.
- **Interface/deployment:** terminal CLI dan interactive session.
- **Model/provider:** Qwen models plus configurable OpenAI-compatible providers; subagent dapat memilih provider/model sesuai config.
- **Tools/environment:** file/repository operations, shell, web fetch, dan tools dari MCP.
- **MCP/extensions/skills:** MCP melalui settings.json atau qwen mcp; OAuth/HTTP support; custom subagent config.
- **Subagent/parallel:** named subagents dan fork subagents dengan context terpisah; fork dapat detached/background.
- **Memory/context:** project/user config, separate subagent context, dan memory commands/managed memory pada settings; detail durability harus dibaca per versi.
- **Permission/sandbox:** allow/deny/ask tool rules, plan restrictions, untrusted-folder protection, dan audit trail.
- **Git/workflow:** repository operations melalui built-in/terminal tools; dedicated Git workflow tidak terverifikasi.
- **Pricing/limits:** local CLI; biaya mengikuti Qwen/API/provider; hosted Qwen Code pricing tidak terverifikasi.
- **Sumber:** [repository](https://github.com/QwenLM/qwen-code), [MCP](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/), [settings and permissions](https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md), [sub-agents](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/sub-agents.md).

### 11. OpenAI Codex CLI

- **Status:** Aktif.
- **Ownership/source posture:** CLI open source menurut dokumentasi OpenAI; Codex app/cloud adalah product surface proprietary/open service yang terpisah.
- **Interface/deployment:** terminal CLI; multimodal prompt; app/IDE/cloud surfaces tersedia pada keluarga Codex.
- **Model/provider:** OpenAI Codex/GPT models; provider-agnostic behavior tidak menjadi kontrak utama.
- **Tools/environment:** read, write, edit, shell, Git, image/screenshot input, MCP, skills, plugins, dan web/cloud path bergantung interface.
- **MCP/extensions/skills:** MCP and plugin/skill mechanisms documented for Codex surfaces; exact parity antara CLI, app, dan cloud perlu dibedakan.
- **Subagent/parallel:** app/cloud supports delegated parallel tasks; exact CLI subagent feature set harus diverifikasi per release.
- **Memory/context:** AGENTS.md, sessions, context management, memories, and compaction patterns across Codex surfaces.
- **Permission/sandbox:** Suggest, Auto Edit, dan Full Auto pada CLI; sandbox, network restrictions, approvals, and OS keychain integration.
- **Git/workflow:** local repository, branches/worktrees, cloud task branches, and diff/review workflow.
- **Pricing/limits:** CLI/API pricing and eligible ChatGPT plan access differ; plan inclusion is volatile and must be checked on official pricing/help pages.
- **Sumber:** [Codex CLI getting started](https://help.openai.com/en/articles/11096431), [repository](https://github.com/openai/codex), [Codex app](https://openai.com/index/introducing-the-codex-app/), [safe operation](https://openai.com/index/running-codex-safely/).

### 12. Grok Build

- **Status:** Aktif/watchlist.
- **Ownership/source posture:** official xAI open-source coding-agent harness.
- **Interface/deployment:** CLI/TUI with interactive terminal agent loop; broader deployment and workspace isolation should be checked against the current repository.
- **Model/provider:** xAI/Grok-oriented; external provider flexibility Unknown.
- **Tools/environment:** coding tools, terminal interaction, and tool dispatch are documented; browser/desktop sandbox breadth Unknown.
- **MCP/extensions/skills:** skills, hooks, MCP, memory, and subagent patterns are described in official product material; exact parity with repository implementation must be checked.
- **Subagent/parallel:** official announcement advertises parallel subagents; exact limits Unknown.
- **Memory/context:** memory and project context are advertised; exact persistence semantics Unknown.
- **Permission/sandbox:** interactive terminal and sandbox details are version-sensitive; do not assume network or filesystem isolation without checking the release.
- **Git/workflow:** coding/repository workflow is the primary use case; Git-native automation details Unknown.
- **Pricing/limits:** local/open-source harness; model/provider cost applies.
- **Sumber:** [repository](https://github.com/xai-org/grok-build), [official announcement](https://x.ai/news/grok-build-open-source).

## B. Proprietary, IDE, desktop, dan cloud coding harness

### 13. Claude Code

- **Status:** Aktif.
- **Ownership/source posture:** proprietary Anthropic product/client.
- **Interface/deployment:** terminal, VS Code/JetBrains integrations, desktop/web surfaces, CI/CD, Remote Control, dan hosted/cloud integrations.
- **Model/provider:** Claude models; provider-locked.
- **Tools/environment:** files, search, shell, Git, web access through configured integrations, dan external MCP tools.
- **MCP/extensions/skills:** CLAUDE.md, skills, MCP, plugins/marketplaces, hooks, commands, output styles, dan custom subagents.
- **Subagent/parallel:** isolated subagents dan experimental agent teams; agents dapat digunakan untuk parallel research/development.
- **Memory/context:** CLAUDE.md, project/global rules, auto memory, compaction, agent-memory, session context, dan project-specific configuration.
- **Permission/sandbox:** granular allow/ask/deny, permission modes, hooks yang dapat memblokir tool calls, sandbox behavior yang bergantung host dan settings.
- **Git/workflow:** Git state awareness, worktrees, diffs, branch-aware workflow, dan CI/CD.
- **Pricing/limits:** subscription/API/enterprise options berubah menurut plan; gunakan pricing dan usage docs Anthropic terkini.
- **Sumber:** [how Claude Code works](https://code.claude.com/docs/en/how-claude-code-works), [extension overview](https://code.claude.com/docs/en/features-overview), [permissions](https://code.claude.com/docs/en/permissions), [subagents](https://code.claude.com/docs/en/sub-agents), [configuration directory](https://code.claude.com/docs/en/claude-directory).

### 14. OpenAI Codex app dan cloud

- **Status:** Aktif.
- **Ownership/source posture:** proprietary OpenAI product surface; berbagi keluarga dengan CLI open source, tetapi app/cloud capabilities dan entitlements berbeda.
- **Interface/deployment:** desktop app, IDE extension, web/cloud tasks, dan local CLI integration.
- **Model/provider:** OpenAI Codex/GPT models.
- **Tools/environment:** local repository tools, shell, web/search, MCP, skills/plugins, dan cloud execution.
- **MCP/extensions/skills:** skills dan plugins; connected apps/tools melalui workspace-approved integrations; exact surface parity version-sensitive.
- **Subagent/parallel:** best-of-N, delegated tasks, dan parallel agent work didokumentasikan untuk app/cloud surfaces.
- **Memory/context:** AGENTS.md, sessions, task summaries, memories, context compaction, dan cloud task artifacts.
- **Permission/sandbox:** local sandbox, network controls, approvals, cloud isolation, dan enterprise policy controls.
- **Git/workflow:** branches, worktrees, diffs, cloud PR/task workflow, dan local continuation.
- **Pricing/limits:** eligible ChatGPT plans dan/atau API usage; exact limits plan- dan date-dependent.
- **Sumber:** [Codex app](https://openai.com/index/introducing-the-codex-app/), [safe operation](https://openai.com/index/running-codex-safely/), [Codex CLI help](https://help.openai.com/en/articles/11096431), [Codex cloud agent](https://developers.openai.com/codex/cloud/agent/).

### 15. Cursor

- **Status:** Aktif.
- **Ownership/source posture:** proprietary editor/service dari Anysphere.
- **Interface/deployment:** desktop IDE, CLI, background/cloud agents, dan API-related surfaces.
- **Model/provider:** model picker dengan beberapa frontier providers/models; exact catalog berubah.
- **Tools/environment:** file search/read/edit/delete, terminal, browser/web, codebase context, dan background execution.
- **MCP/extensions/skills:** MCP, skills, hooks, rules, team marketplace, dan custom context/rules.
- **Subagent/parallel:** background agents dan API agents; official material mengiklankan multiple concurrent agents untuk beberapa plan/workflow.
- **Memory/context:** project rules, codebase indexing/context, conversation context, dan background-agent context.
- **Permission/sandbox:** foreground approvals; background agents berjalan di isolated cloud VM dengan autonomy/security berbeda.
- **Git/workflow:** GitHub integration, branches, diffs, Bugbot, dan cloud-agent changes.
- **Pricing/limits:** Hobby free; Pro USD 20/month; Teams USD 40/user/month pada snapshot; Pro+/Ultra dan usage limits berubah.
- **Sumber:** [agent tools](https://docs.cursor.com/en/agent/tools), [background agent](https://docs.cursor.com/background-agent), [pricing](https://cursor.com/pricing), [rules](https://docs.cursor.com/context/rules-for-ai).

### 16. Windsurf/Cascade

- **Status:** Aktif.
- **Ownership/source posture:** proprietary IDE/extensions/service.
- **Interface/deployment:** desktop IDE, plugins, CLI/cloud features; exact surface matrix berubah.
- **Model/provider:** multiple model choices; provider/model list version- dan plan-sensitive.
- **Tools/environment:** file operations, terminal, browser/web, MCP, workflows, dan project context.
- **MCP/extensions/skills:** MCP, workflows, rules, memories, dan extension/integration surfaces.
- **Subagent/parallel:** Unknown dari primary pages yang direview.
- **Memory/context:** Cascade memories dan workspace/project context didokumentasikan; durability dan team scope bergantung settings.
- **Permission/sandbox:** autonomy/approval controls ada; cloud execution dan isolation detail sebagian tidak terdokumentasi pada halaman yang direview.
- **Git/workflow:** local Git dan change review workflow.
- **Pricing/limits:** free dan paid individual/team/enterprise tiers; exact amounts dan usage limits dinamis.
- **Sumber:** [Cascade overview](https://docs.windsurf.com/windsurf/cascade/overview), [memories](https://docs.windsurf.com/windsurf/cascade/memories), [workflows](https://docs.windsurf.com/windsurf/cascade/workflows), [MCP](https://docs.windsurf.com/windsurf/cascade/mcp), [pricing](https://windsurf.com/pricing).

### 17. GitHub Copilot coding agent

- **Status:** Aktif.
- **Ownership/source posture:** proprietary GitHub/Microsoft service.
- **Interface/deployment:** GitHub.com issue/PR agent, IDE agent modes, CLI, dan hosted repository execution.
- **Model/provider:** multiple models dari GitHub catalog; exact current matrix berubah menurut plan dan rollout.
- **Tools/environment:** repository files, code search, terminal di hosted environment, GitHub APIs, MCP, dan workflow tools.
- **MCP/extensions/skills:** GitHub-native MCP, skills, plugins, custom agents, repository instructions, dan organization customizations.
- **Subagent/parallel:** capability berbeda menurut surface; coding agent dapat bekerja asynchronous pada issue/branch; CLI mengiklankan agentic workflows.
- **Memory/context:** repository instructions, customizations, issue/PR context, code search, dan hosted workspace state.
- **Permission/sandbox:** hosted environment permissions, approval/review workflow, branch/PR isolation, dan organization policy.
- **Git/workflow:** GitHub branches, commits, pull requests, reviews, dan Actions integration native.
- **Pricing/limits:** Free, Pro, Pro+, Max, Business, Enterprise, serta credit/usage limits; entitlements harus dicek pada [official plans](https://github.com/features/copilot/plans).
- **Sumber:** [CLI product page](https://github.com/features/copilot/cli), [coding agent concept](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent), [custom instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot), [CLI reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference).

### 18. GitHub Copilot CLI

- **Status:** Aktif.
- **Ownership/source posture:** proprietary CLI.
- **Interface/deployment:** local terminal; output dapat dikomposisikan dengan shell/GitHub workflows.
- **Model/provider:** Copilot model catalog; user model selection tersedia tetapi daftar berubah.
- **Tools/environment:** files, shell, GitHub MCP, MCP servers, plugins, skills, custom agents, dan repository instruction discovery.
- **MCP/extensions/skills:** first-class MCP, plugins, skills, dan custom agents.
- **Subagent/parallel:** multi-agent support diiklankan; detail orchestration masih rollout-dependent.
- **Memory/context:** user/project instructions, repository context, session state, dan CLI configuration.
- **Permission/sandbox:** approval dan permission controls; local shell/file access mengikuti CLI dan environment user.
- **Git/workflow:** native Git/GitHub CLI composition.
- **Pricing/limits:** termasuk dalam eligible Copilot plans dan memakai AI credits/usage limits.
- **Sumber:** [Copilot CLI](https://github.com/features/copilot/cli), [CLI command reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference), [Copilot plans](https://github.com/features/copilot/plans).

### 19. Devin

- **Status:** Aktif.
- **Ownership/source posture:** proprietary Cognition cloud agent.
- **Interface/deployment:** browser/web workspace, cloud computer/VM, IDE-like environment, dan local-to-cloud workflow options.
- **Model/provider:** provider/model details mostly abstracted oleh service; exact current model list Unknown.
- **Tools/environment:** shell, editor, browser, apps, repository integrations, dan cloud workspace.
- **MCP/extensions/skills:** integrations dan configured workflows; exact MCP/skills/subagent packaging Unknown dari primary pages yang direview.
- **Subagent/parallel:** multiple Devin instances/background work didokumentasikan; formal subagent semantics Unknown.
- **Memory/context:** persistent sessions, checkpoints, dan cloud task context.
- **Permission/sandbox:** cloud VM/permissions; organization controls dan browser credential boundaries perlu diverifikasi per plan.
- **Git/workflow:** GitHub/GitLab integration, branches, PRs, dan checkpoint/review workflow.
- **Pricing/limits:** free/paid/teams/enterprise-style options dengan ACU atau usage billing; lihat [official billing docs](https://docs.devin.ai/admin/billing).
- **Sumber:** [Devin docs](https://docs.devin.ai/), [overview](https://devin.ai/), [billing](https://docs.devin.ai/admin/billing).

### 20. Replit Agent

- **Status:** Aktif.
- **Ownership/source posture:** proprietary Replit SaaS.
- **Interface/deployment:** browser IDE, cloud workspace, preview, dan one-click deployment/publishing.
- **Model/provider:** Replit-managed integrations yang mencakup Claude, ChatGPT, Gemini, dan model lain.
- **Tools/environment:** files, shell/runtime, preview, packages, databases, connectors, deployment, dan project operations.
- **MCP/extensions/skills:** connectors dan integrations didokumentasikan; MCP, plugins, dan subagent matrix Unknown pada primary pages yang direview.
- **Subagent/parallel:** background tasks didokumentasikan; formal subagent model Unknown.
- **Memory/context:** project/workspace context, checkpoints, history, dan rollback.
- **Permission/sandbox:** cloud workspace dan deployment controls; detailed tool permission contract Unknown.
- **Git/workflow:** GitHub sync/integration dan project history.
- **Pricing/limits:** Starter/Core/Pro-style plans; Agent billing/credits effort-based dan berubah menurut plan.
- **Sumber:** [Replit Agent](https://docs.replit.com/replitai/agent), [AI billing](https://docs.replit.com/billing/ai-billing), [pricing](https://replit.com/pricing).

### 21. Amazon Q Developer

- **Status:** Aktif.
- **Ownership/source posture:** proprietary AWS product; Q CLI repository vendor-owned dan publicly available, sehingga source posture berbeda per component.
- **Interface/deployment:** VS Code, JetBrains, Visual Studio, Cloud9, CLI, AWS console, dan cloud service integration.
- **Model/provider:** Amazon Q/Nova dan supported third-party model options; exact matrix berubah.
- **Tools/environment:** file/code tools, shell, AWS APIs, IDE actions, MCP, dan cloud resources.
- **MCP/extensions/skills:** MCP untuk IDE/CLI, customizations, plugins, agent profiles, dan AWS integrations.
- **Subagent/parallel:** Unknown pada primary pages yang direview.
- **Memory/context:** project/global configuration, AWS context, repository context, dan customizations.
- **Permission/sandbox:** approvals, tool permissions, AWS IAM, dan environment controls; sandbox bergantung host.
- **Git/workflow:** repository/Git support dan AWS development workflows.
- **Pricing/limits:** free tier plus Pro/enterprise pricing; current limits bergantung channel.
- **Sumber:** [agentic coding](https://aws.amazon.com/q/developer/build/), [MCP](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/mcp-ide.html), [CLI repository](https://github.com/aws/amazon-q-developer-cli), [pricing](https://aws.amazon.com/q/developer/pricing/).

### 22. JetBrains Junie

- **Status:** Aktif.
- **Ownership/source posture:** proprietary JetBrains harness.
- **Interface/deployment:** JetBrains IDEs, Junie CLI, ACP/IDE integrations, local execution, dan cloud-backed model execution.
- **Model/provider:** any model/BYOK/local model support didokumentasikan; exact current provider matrix berubah.
- **Tools/environment:** read/write/edit, terminal, tests, commands, MCP, project context, dan code review workflows.
- **MCP/extensions/skills:** MCP, agent skills, persistent guidelines, custom commands, dan custom subagents.
- **Subagent/parallel:** custom subagents dan parallel delegation didokumentasikan.
- **Memory/context:** guidelines, skills, cross-session memory, task context, dan IDE project context.
- **Permission/sandbox:** granular tool restrictions/approvals; details berbeda antara IDE dan CLI.
- **Git/workflow:** Git operations dan IDE review workflow.
- **Pricing/limits:** free start, AI Pro/Ultimate, BYOK/provider-rate options; amounts berubah.
- **Sumber:** [Junie product page](https://junie.jetbrains.com/), [CLI subagents](https://junie.jetbrains.com/docs/junie-cli-subagents.html), [JetBrains Junie docs](https://www.jetbrains.com/help/idea/junie.html), [AI pricing](https://www.jetbrains.com/ai-ides/buy/).

### 23. Sourcegraph Amp

- **Status:** Aktif, tetapi beberapa feature/pricing details kurang terbuka.
- **Ownership/source posture:** proprietary Sourcegraph product.
- **Interface/deployment:** CLI/TUI dan web-oriented workflow; local/cloud execution detail sebagian Unknown.
- **Model/provider:** Sourcegraph-selected frontier models; exact catalog Unknown.
- **Tools/environment:** code search/navigation, terminal/files, repository context, dan MCP.
- **MCP/extensions/skills:** MCP dan Sourcegraph code intelligence; plugin/skills packaging Unknown.
- **Subagent/parallel:** multi-repo dan parallel-agent behavior diiklankan; formal subagent contract Unknown.
- **Memory/context:** Sourcegraph indexed context/code intelligence; persistent memory semantics Unknown.
- **Permission/sandbox:** governed by Sourcegraph/Git provider dan host execution; detailed default sandbox Unknown.
- **Git/workflow:** Git repository context dan review workflow.
- **Pricing/limits:** Amp-specific public pricing tidak cukup terbuka dalam pass ini; Sourcegraph enterprise pricing bukan pengganti Amp pricing.
- **Sumber:** [Amp](https://ampcode.com/), [Sourcegraph Amp](https://sourcegraph.com/amp), [Sourcegraph pricing](https://sourcegraph.com/pricing).

### 24. Factory Droid

- **Status:** Aktif.
- **Ownership/source posture:** proprietary Factory product.
- **Interface/deployment:** CLI, desktop app, SDK, local agents, cloud/background agents, managed cloud computers, dan enterprise/on-prem options.
- **Model/provider:** Factory model pool, open-weight Core models, BYOK, AWS Bedrock, Vertex, Azure OpenAI, dan gateway integrations.
- **Tools/environment:** files, shell, browser/integrations sesuai environment, MCP, plugins, skills, commands, dan custom Droids.
- **MCP/extensions/skills:** plugin packaging, skills, custom Droids, commands, dan MCP.
- **Subagent/parallel:** sub-Droids dan parallel/background agents.
- **Memory/context:** project/user config, agent-readiness/context, dan task context.
- **Permission/sandbox:** autonomy levels, organization allow/deny controls, managed environments, dan worktree isolation.
- **Git/workflow:** Git/worktrees, pull request workflows, dan cloud/background branch execution.
- **Pricing/limits:** Pro USD 20/month, Plus USD 100/month, Max USD 200/month; Teams/Enterprise custom dan on-prem terms terpisah.
- **Sumber:** [Factory docs](https://docs.factory.ai/), [plugins](https://docs.factory.ai/cli/configuration/plugins), [model gateways](https://docs.factory.ai/enterprise/models-llm-gateways-and-integrations), [pricing](https://docs.factory.ai/pricing).

### 25. Augment Code/Auggie

- **Status:** Aktif.
- **Ownership/source posture:** proprietary Augment Code.
- **Interface/deployment:** VS Code, JetBrains, CLI/Auggie, dan local agent dengan Augment cloud Context Engine.
- **Model/provider:** Augment model catalog/model picker; exact provider ownership/BYOK details sebagian Unknown.
- **Tools/environment:** files, terminal, tests, codebase indexing/context, dan MCP/external integrations.
- **MCP/extensions/skills:** Context Engine MCP; skills/subagents/plugins Unknown pada sources yang direview.
- **Memory/context:** large indexed codebase context dan project state.
- **Permission/sandbox:** approval/security details Unknown di luar host/IDE controls.
- **Git/workflow:** Git/GitHub integration dan repository context.
- **Pricing/limits:** individual/team/enterprise pricing; current public amounts Unknown pada pass ini.
- **Sumber:** [agent](https://docs.augmentcode.com/using-augment/agent), [available models](https://docs.augmentcode.com/models/available-models), [Augment Code](https://www.augmentcode.com/).

### 26. Warp Agent

- **Status:** Aktif.
- **Ownership/source posture:** proprietary desktop terminal/agent platform; exact source posture setiap component mixed.
- **Interface/deployment:** desktop terminal, local agents, cloud agents, Warp CLI, dan local-to-cloud handoff.
- **Model/provider:** curated model choices dan user-selected LLMs; provider list berubah.
- **Tools/environment:** full terminal, interactive apps, files, workflows, MCP, dan terminal-native development.
- **MCP/extensions/skills:** MCP, profiles, rules, workflows, dan reusable terminal workflows.
- **Subagent/parallel:** Unknown pada primary pages yang direview.
- **Memory/context:** profiles, rules, terminal/session context; persistent memory semantics Unknown.
- **Permission/sandbox:** safe/approval modes dan YOLO-style autonomy; local/cloud isolation details Unknown.
- **Git/workflow:** terminal-native Git workflow.
- **Pricing/limits:** free/build/max/business plans dan credit limits; exact current amounts dinamis.
- **Sumber:** [local agents](https://docs.warp.dev/agent-platform/local-agents/overview), [MCP](https://docs.warp.dev/agent-platform/capabilities/mcp), [Warp](https://www.warp.dev/), [pricing](https://www.warp.dev/pricing).

### 27. Kiro

- **Status:** Aktif.
- **Ownership/source posture:** proprietary AWS agent IDE/CLI/web product.
- **Interface/deployment:** desktop IDE, CLI, web, dan unified project workflow.
- **Model/provider:** Claude Sonnet dan open-weight model choices; exact provider matrix berubah.
- **Tools/environment:** files, shell, web, AWS, code search, MCP, skills, steering, hooks, dan project specs.
- **MCP/extensions/skills:** MCP, agent skills, steering files, hooks, AGENTS.md, dan custom subagents.
- **Subagent/parallel:** custom subagents, isolated context, dan up to four concurrent subagents didokumentasikan.
- **Memory/context:** specs, steering, AGENTS.md, hooks, project context, dan subagent context.
- **Permission/sandbox:** capability-based permissions dan approvals; detail berbeda menurut CLI/IDE/web.
- **Git/workflow:** Git dan project/spec workflow.
- **Pricing/limits:** free credits; Pro USD 20/month, Pro+ USD 40/month, Pro Max USD 100/month, Power USD 200/month pada snapshot; cek FAQ terkini.
- **Sumber:** [Kiro CLI subagents](https://kiro.dev/docs/cli/chat/subagents/), [CLI v3](https://kiro.dev/docs/cli/v3/), [FAQ/pricing](https://kiro.dev/faq/).

### 28. Gemini Code Assist agent mode

- **Status:** Aktif.
- **Ownership/source posture:** proprietary Google Cloud/IDE service; Gemini CLI adalah runtime open source terpisah.
- **Interface/deployment:** VS Code dan supported IDE agent mode, Google Cloud/enterprise environment, dan Gemini tooling terkait.
- **Model/provider:** Gemini model family dan Google-managed provider.
- **Tools/environment:** file search/read/write, terminal commands, grep, MCP servers, dan bespoke service implementations.
- **MCP/extensions/skills:** local/remote MCP, coreTools/excludeTools, IDE settings, dan Google Cloud integrations.
- **Subagent/parallel:** Unknown pada agent-mode page yang direview.
- **Memory/context:** IDE/project context dan Gemini chat history; durable memory semantics Unknown.
- **Permission/sandbox:** coreTools/excludeTools dan approval controls; exact sandbox bergantung IDE/product mode.
- **Git/workflow:** local repository dan IDE Source Control; GitHub-native cloud agent bukan primary contract.
- **Pricing/limits:** Google Cloud/Gemini Code Assist plan dan enterprise quotas; cek current pricing.
- **Sumber:** [agent mode](https://developers.google.com/gemini-code-assist/docs/use-agentic-chat-pair-programmer?hl=en), [overview](https://cloud.google.com/gemini/docs/codeassist/overview), [pricing](https://cloud.google.com/gemini/docs/codeassist/pricing).

### 29. Zed Agent

- **Status:** Aktif.
- **Ownership/source posture:** Zed editor open source; Zed-hosted model/service options dan external-agent integrations memiliki terms terpisah.
- **Interface/deployment:** Zed Agent Panel, Threads Sidebar, terminal threads, external ACP agents, dan parallel agents.
- **Model/provider:** Zed-hosted models, API providers, local models, dan provider milik external agent.
- **Tools/environment:** project read/search, file edit, terminal, review, diagnostics, dan MCP tools.
- **MCP/extensions/skills:** Agent Profiles, Skills, Instructions, MCP servers, dan ACP external-agent path.
- **Subagent/parallel:** parallel agents/threads; external-agent feature parity berbeda menurut integration.
- **Memory/context:** threads, summaries, project instructions, skills, profiles, dan review checkpoints.
- **Permission/sandbox:** tool permissions confirm/allow/deny; profiles menentukan tool availability; optional terminal sandbox restrictions.
- **Git/workflow:** worktree picker, checkpoints, review UI, dan repository context.
- **Pricing/limits:** Zed free/open editor plus hosted model/provider plans; usage berbeda.
- **Sumber:** [Zed Agent](https://zed.dev/docs/ai/zed-agent), [Agent Panel](https://zed.dev/docs/ai/agent-panel), [Agent Profiles](https://zed.dev/docs/ai/agent-profiles), [MCP](https://zed.dev/docs/ai/mcp?highlight=mcp), [agents](https://zed.dev/docs/ai/agents).

### 30. Tabnine Agent

- **Status:** Aktif.
- **Ownership/source posture:** proprietary enterprise-oriented coding platform.
- **Interface/deployment:** VS Code, Visual Studio 2022/2026, JetBrains IDEs; platform juga diposisikan across IDE dan CLI.
- **Model/provider:** Tabnine proprietary models plus selectable third-party/frontier/open models; enterprise admin mengontrol model yang tersedia.
- **Tools/environment:** project files, create/edit/search, codebase context, refactoring, tests, documentation, dan policy validation.
- **MCP/extensions/skills:** full MCP support dan governed enterprise integrations; exact plugin/skill packaging Unknown.
- **Subagent/parallel:** Unknown.
- **Memory/context:** project state, enterprise context engine, repository context, dan user feedback loop.
- **Permission/sandbox:** plan review, approval before coding, file accept/reject controls, enterprise governance; sandbox detail Unknown.
- **Git/workflow:** project file changes dan enterprise development workflow; Git-native capabilities Unknown.
- **Pricing/limits:** enterprise/team plans; exact public pricing Unknown.
- **Sumber:** [Tabnine Agent](https://docs.tabnine.com/main/getting-started/tabnine-agent), [how to use](https://docs.tabnine.com/main/getting-started/tabnine-agent/how-to-use-tabnine-agent), [AI models](https://docs.tabnine.com/main/welcome/readme/ai-models), [platform](https://www.tabnine.com/platform/).

## C. Cloud app-builder dan deployment-oriented harness

### 31. Lovable

- **Status:** Aktif.
- **Ownership/source posture:** proprietary SaaS full-stack AI development platform.
- **Interface/deployment:** browser workspace, shared projects, code editor, preview, deployment, dan GitHub/GitLab sync.
- **Model/provider:** Lovable AI dengan Gemini default pada dokumentasi yang direview, plus supported model choices dan provider integrations.
- **Tools/environment:** codebase exploration, file changes, backend/database/auth generation, browser testing, logs/network inspection, security scans, image/video generation, dan external docs/assets.
- **MCP/extensions/skills:** chat connectors/MCP, app connectors, APIs, third-party integrations, dan hosted MCP server untuk published apps.
- **Subagent/parallel:** prompt queue dan task queue; formal subagent orchestration Unknown.
- **Memory/context:** recent messages, project history, versions, workspaces, dan codebase context; long-term memory lintas project terbatas menurut FAQ.
- **Permission/sandbox:** visible progress, plan mode vs agent mode, reviewable diffs, workspace roles, integration permission boundaries, dan security scans.
- **Git/workflow:** GitHub/GitLab sync dan code export; deployment ke platform terkait.
- **Pricing/limits:** Agent mode usage-based; credit/cloud/AI balance dan plan limits berubah.
- **Sumber:** [welcome](https://docs.lovable.dev/introduction/welcome), [agent mode](https://docs.lovable.dev/features/agent-mode), [code mode](https://docs.lovable.dev/features/code-mode), [integrations](https://docs.lovable.dev/integrations/introduction), [security](https://docs.lovable.dev/features/security), [AI integrations](https://docs.lovable.dev/integrations/ai).

### 32. Bolt.new

- **Status:** Aktif.
- **Ownership/source posture:** proprietary StackBlitz cloud app-builder.
- **Interface/deployment:** browser chat/workspace, project file system, preview, hosting, databases, and custom domains.
- **Model/provider:** provider/model abstraction milik Bolt; exact model picker/provider flexibility Unknown.
- **Tools/environment:** project file synchronization, code generation/editing, web app preview, hosting, web requests, databases, uploads, and deployment.
- **MCP/extensions/skills:** team/package prompts and external integrations are documented at plan level; MCP/skills/subagent matrix Unknown.
- **Subagent/parallel:** Unknown.
- **Memory/context:** project file system is synced to the AI; token usage depends project size.
- **Permission/sandbox:** cloud workspace and plan-level controls; exact agent approval/sandbox policy Unknown.
- **Git/workflow:** project export/integration details need separate official-doc pass; GitHub workflow not asserted here without a direct current source.
- **Pricing/limits:** Free USD 0 with daily/monthly token limits; Pro USD 25/month; Teams USD 30/user/month; Enterprise custom on the snapshot pricing page.
- **Sumber:** [official pricing and feature limits](https://bolt.new/pricing), [support center](https://support.bolt.new/).

### 33. v0

- **Status:** Aktif.
- **Ownership/source posture:** proprietary Vercel product.
- **Interface/deployment:** browser chat/editor, code view, preview/design mode, Vercel project, and deployment.
- **Model/provider:** Vercel-managed model access and Vercel AI Gateway integration; exact model catalog changes.
- **Tools/environment:** code editing, natural-language changes, web search, browser use, automatic error fixing, terminal commands in sandbox, Vercel/GitHub CLI, and integrations.
- **MCP/extensions/skills:** Marketplace integrations and custom MCP servers.
- **Subagent/parallel:** Unknown.
- **Memory/context:** chat/project versions, source code, preview, and Vercel project context.
- **Permission/sandbox:** Ask, Auto, and Full permission modes; terminal runs inside sandbox.
- **Git/workflow:** bidirectional Git integration, export to local codebase, Vercel project/deployment, environment variables, and integrations.
- **Pricing/limits:** Free, Premium USD 20/month, Team USD 30/user/month, Enterprise custom according to official FAQ; credits/generation limits vary.
- **Sumber:** [v0 overview](https://vercel.com/docs/v0), [agentic features](https://api2.v0.dev/docs/agentic-features), [code editing](https://v0.dev/docs/code-editing), [FAQ/pricing](https://v0.dev/docs/faqs).

### 34. Firebase Studio

- **Status:** Transitional.
- **Ownership/source posture:** proprietary Google cloud workspace/service.
- **Interface/deployment:** browser cloud workspace, Code view, Prototyper view, terminal, preview, and Firebase deployment.
- **Model/provider:** Gemini.
- **Tools/environment:** code suggestions, file updates, terminal commands, output interpretation, app prototyping, Next.js generation, Firebase App Hosting, and MCP.
- **MCP/extensions/skills:** MCP servers through .idx/mcp.json; tools/resources available in Agent and App Prototyping modes.
- **Subagent/parallel:** Unknown.
- **Memory/context:** workspace project context and agent chat history files; migration docs describe where history is stored.
- **Permission/sandbox:** cloud workspace and MCP trust warning; exact agent permission model Unknown.
- **Git/workflow:** source control, Git history, import/export, and Firebase deployment.
- **Pricing/limits:** Gemini no-cost while preview on the reviewed page; workspace creation disabled from 22 June 2026 and service shutdown planned for 22 March 2027. Existing workspace migration is required.
- **Sumber:** [AI assistance](https://firebase.google.com/docs/studio/ai-assistance), [MCP servers](https://firebase.google.com/docs/studio/mcp-servers), [workspace](https://firebase.google.com/docs/studio/get-started-workspace?hl=en), [migration/sunset](https://firebase.google.com/docs/studio/migrating-project).

### 35. Vercel Agent

- **Status:** Aktif/Beta.
- **Ownership/source posture:** proprietary Vercel AI Cloud service.
- **Interface/deployment:** Vercel dashboard and enterprise/pro workflows, with agent access to repository/deployment/runtime context.
- **Model/provider:** Vercel-managed/underlying AI provider models; exact catalog Unknown.
- **Tools/environment:** code review, repository analysis, deployment history/runtime behavior, secure sandbox reproduction, Vercel integrations, logs, and MCP-backed Agent Tools.
- **MCP/extensions/skills:** Vercel MCP and installed integration tools; full skills/subagent packaging Unknown.
- **Subagent/parallel:** Unknown.
- **Memory/context:** Vercel codebase, deployment history, runtime behavior, and incident context.
- **Permission/sandbox:** secure AI Cloud sandbox; integration tools should be configured with human confirmation.
- **Git/workflow:** code reviews and pull-request creation are central.
- **Pricing/limits:** Beta on Enterprise/Pro in the reviewed page; each review/investigation has a fixed USD 0.30 plus underlying token cost according to the page.
- **Sumber:** [Vercel Agent](https://vercel.com/docs/agent), [Vercel Agent Tools](https://vercel.com/docs/integrations/install-an-integration/agent-tools), [Vercel MCP tools](https://vercel.com/docs/agent-resources/vercel-mcp/tools).

## D. Browser dan computer-use runtime

### 36. Browser Use

- **Status:** Aktif.
- **Ownership/source posture:** open source MIT repository plus Browser Use Cloud service.
- **Interface/deployment:** Python SDK, TypeScript/Cloud SDK, CLI, local Chromium/Chrome, and managed cloud browsers.
- **Model/provider:** OpenAI, Anthropic, Gemini, Ollama, Browser Use models, dan provider-prefixed model IDs.
- **Tools/environment:** navigate, click, type, forms, upload, screenshots, JavaScript, files, auth profiles, proxies, and CAPTCHA-related cloud capabilities.
- **MCP/extensions/skills:** custom tools and skills; cloud filesystem/memory and parallel cloud sessions are documented.
- **Subagent/parallel:** parallel cloud execution is documented; exact local orchestration Unknown.
- **Memory/context:** cloud sessions can use persistent filesystem and memory; exact retention/tenant behavior needs plan-level verification.
- **Permission/sandbox:** local process or managed browser; approval semantics Unknown; auth/profile controls are documented.
- **Git/workflow:** not primarily Git-focused; can be used by a host agent that owns repository actions.
- **Pricing/limits:** cloud session pricing page documents USD 0.06/hour PAYG and USD 0.03/hour Business/Scaleup at snapshot; model and cloud usage can add cost.
- **Sumber:** [repository](https://github.com/browser-use/browser-use), [Cloud quickstart](https://docs.browser-use.com/cloud/quickstart), [browser session pricing](https://docs.browser-use.com/cloud/api-v3/browsers/create-browser-session).

### 37. Browser Harness

- **Status:** Aktif/watchlist.
- **Ownership/source posture:** open source MIT developer harness from Browser Use ecosystem.
- **Interface/deployment:** editable CDP harness attached to existing Chrome/Chromium or Browser Use cloud; agent loop is supplied by the host agent.
- **Model/provider:** host-agent dependent; own model support Unknown.
- **Tools/environment:** direct CDP browser interaction plus agent workspace helpers and persistent browser state.
- **MCP/extensions/skills:** domain skills and editable helper workspace; subagents Unknown.
- **Permission/sandbox:** user-visible browser attach, cloud/headless options; approval and sandbox depend on host.
- **Git/workflow:** helper workspace can support repository work, but Git orchestration is host-dependent.
- **Pricing/limits:** MIT local harness; cloud browser usage billed separately.
- **Sumber:** [repository](https://github.com/browser-use/browser-harness), [install/connection spec](https://github.com/browser-use/browser-harness/blob/main/install.md).

### 38. Stagehand

- **Status:** Aktif.
- **Ownership/source posture:** open source SDK with Browserbase service integration.
- **Interface/deployment:** TypeScript/Go SDK; local browser or Browserbase; direct primitives and autonomous agent.execute loop.
- **Model/provider:** OpenAI, Anthropic, dan provider lain yang dikonfigurasi; DOM, vision, dan hybrid modes.
- **Tools/environment:** act, observe, extract, browser navigation/interaction, Browserbase Search, DOM/vision/hybrid computer-use.
- **MCP/extensions/skills:** custom tools, excluded tools, MCP server, caching/self-healing; formal skills packaging Unknown.
- **Subagent/parallel:** parallelism tidak dinyatakan jelas pada sumber utama yang direview.
- **Memory/context:** agent state/caching dan browser session; long-term memory Unknown.
- **Permission/sandbox:** local atau Browserbase deployment; approval/sandbox semantics Unknown.
- **Git/workflow:** host/application-dependent.
- **Pricing/limits:** Browserbase Free/Developer/Startup/Scale plans; exact pricing varies.
- **Sumber:** [quickstart](https://docs.stagehand.dev/v2/first-steps/quickstart), [agent](https://docs.stagehand.dev/v3/basics/agent), [API](https://docs.stagehand.dev/v3/references/stagehand), [Browserbase pricing](https://www.browserbase.com/pricing).

### 39. Microsoft Playwright MCP

- **Status:** Aktif, sebagai substrate.
- **Ownership/source posture:** open source Apache-2.0 repository.
- **Interface/deployment:** MCP server consumed by VS Code, Cursor, Windsurf, Claude Code, Claude Desktop, and other MCP hosts.
- **Model/provider:** host-dependent; no model bundled.
- **Tools/environment:** local Chrome, Firefox, WebKit, Edge; accessibility snapshots, navigation, forms, storage, tracing, network mocking, video, and browser profiles.
- **MCP/extensions/skills:** native MCP; host provides skills/agent loop.
- **Subagent/parallel:** isolated profiles can support parallel browser tasks; autonomous orchestration is host-dependent.
- **Memory/context:** persistent session/storage state can be configured; agent memory is host-dependent.
- **Permission/sandbox:** headed browser by default, isolated mode and storage-state controls; approvals depend on MCP host.
- **Git/workflow:** not a Git harness; host-dependent.
- **Pricing/limits:** no service pricing in repository; browser/local runtime costs depend on host.
- **Scope note:** included as browser-control substrate, not a complete autonomous agent by itself.
- **Sumber:** [repository](https://github.com/microsoft/playwright-mcp), [official MCP documentation](https://github.com/microsoft/playwright.dev/blob/main/mcp/introduction.mdx).

### 40. Skyvern

- **Status:** Aktif.
- **Ownership/source posture:** open-source commercial browser workflow project with cloud/self-host options.
- **Interface/deployment:** Python/TypeScript SDK, REST, dashboard, cloud, Docker/self-host, local/headless/headful/existing Chrome.
- **Model/provider:** OpenAI, Anthropic, Azure OpenAI, Gemini, Ollama, dan OpenAI-compatible providers.
- **Tools/environment:** screenshot/DOM extraction, LLM reasoning, browser actions, extraction, credentials, workflow/goal checks.
- **MCP/extensions/skills:** integrations, page/agent APIs, workflow configuration; MCP/skills packaging Unknown.
- **Subagent/parallel:** Unknown.
- **Memory/context:** browser profiles and workflow state; persistent memory semantics partly documented.
- **Permission/sandbox:** credential handling and browser profiles; approval/sandbox specifics Unknown.
- **Git/workflow:** host/application-dependent.
- **Pricing/limits:** cloud pricing and commercial terms perlu dicek dari offering current; no stable amount captured in this pass.
- **Sumber:** [introduction/agent loop](https://www.skyvern.com/docs/developers/getting-started/introduction), [quickstart](https://www.skyvern.com/docs/developers/getting-started/quickstart), [repository](https://github.com/Skyvern-AI/skyvern).

### 41. OpenAI Agents SDK + ComputerTool

- **Status:** Aktif, sebagai developer runtime.
- **Ownership/source posture:** SDK open source MIT; selected model/tool usage billed separately.
- **Interface/deployment:** Python and JavaScript/TypeScript runtime with agent loop, tool calls, handoffs, guardrails, and application-supplied execution environment.
- **Model/provider:** OpenAI plus provider integrations; exact provider breadth depends SDK/runtime configuration.
- **Tools/environment:** shell, filesystem, browser/desktop implementation, hosted containers/sandbox agents, custom tools, and computer-use tool.
- **MCP/extensions/skills:** MCP, agents-as-tools, handoffs, guardrails, tracing, custom tools, and application-defined skills/memory.
- **Subagent/parallel:** handoffs, agents-as-tools, and multi-agent orchestration.
- **Memory/context:** application-controlled session state, context management, compaction, tracing, and sandbox filesystem.
- **Permission/sandbox:** guardrails, approval gates, local ComputerTool, hosted containers, and application-controlled isolation.
- **Git/workflow:** application-controlled; no Git-native product workflow in the SDK core.
- **Pricing/limits:** SDK license is separate from model/tool/API costs.
- **Scope note:** included because it supplies a runnable agent loop and tool runtime; raw computer-use APIs remain excluded.
- **Sumber:** [Python repository](https://github.com/openai/openai-agents-python), [Python tools](https://openai.github.io/openai-agents-python/tools/), [JavaScript/TypeScript tools](https://openai.github.io/openai-agents-js/guides/tools/).

### 42. Anthropic Computer Use Demo

- **Status:** Aktif sebagai reference harness, bukan hosted product.
- **Ownership/source posture:** Apache-2.0 quickstart/reference repository; API/model usage separate.
- **Interface/deployment:** Streamlit reference UI and agent loop.
- **Model/provider:** Claude through Anthropic API, Amazon Bedrock, or Vertex; exact model versions vary.
- **Tools/environment:** Docker Linux desktop with X11/VNC, native macOS best-practices path, mouse, keyboard, screenshots, and shell.
- **MCP/extensions/skills:** trajectory recording, prompt caching, compaction, batched calls, and sandboxed shell; MCP/plugins not central.
- **Subagent/parallel:** Unknown.
- **Memory/context:** conversation loop, screenshots, tool results, and optional compaction; durable memory Unknown.
- **Permission/sandbox:** official guidance recommends VM/container, allowlists, and human confirmation for consequential actions.
- **Git/workflow:** host/application-dependent.
- **Pricing/limits:** reference code free; API/model usage separately priced.
- **Scope note:** included as a minimal developer-usable computer-use harness; Anthropic's raw computer-use tool alone is listed in exclusion log.
- **Sumber:** [quickstarts](https://github.com/anthropics/claude-quickstarts), [computer-use demo](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo), [platform specification](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool).

## E. Transitional, maintenance-only, dan archived

### 43. Continue

- **Status:** Maintenance-only.
- **Why retained:** historically important open-source coding agent with CLI, VS Code, and JetBrains paths; useful for feature comparison but not a safe default for new adoption.
- **Source posture:** Apache-2.0.
- **Features:** Agent mode, Plan mode read-only, IDE tools, terminal, file edits, MCP servers, rules blocks, custom agent configuration, model/provider config, and CLI headless mode.
- **Evidence:** [official documentation](https://docs.continue.dev/index) states that the repository is read-only and the final 2.0.0 release is the maintained endpoint; [agent mode](https://docs.continue.dev/ide-extensions/agent/quick-start), [configuration](https://docs.continue.dev/reference), [CLI](https://docs.continue.dev/cli/quickstart).

### 44. Roo Code

- **Status:** Archived/shutdown on 15 May 2026.
- **Why retained:** it was a major open-source VS Code agent with modes, MCP, and multi-agent positioning; its shutdown is relevant to product-risk analysis.
- **Source posture:** Apache-2.0 repository remains readable, but official notice says the extension was shut down.
- **Features before shutdown:** Code, Architect, Ask, Debug, custom modes, file/edit/terminal/browser tools, MCP, and dev-team/multi-agent workflows.
- **Evidence:** [official repository and shutdown notice](https://github.com/RooCodeInc/Roo-Code).

### 45. SWE-agent

- **Status:** Maintenance-only/superseded.
- **Why retained:** research-oriented coding-agent harness and benchmark lineage; official CLI docs say mini-SWE-agent is the simpler successor.
- **Source posture:** open source repository; exact license should be checked at the selected tag before redistribution.
- **Features:** CLI, Docker/Codespaces, configurable tools, trajectories, batch runs, replay/inspection, GitHub issue workflows, and remote execution through SWE-ReX.
- **Evidence:** [CLI](https://swe-agent.com/latest/usage/cli/), [repository](https://github.com/SWE-agent/SWE-agent), [official maintenance note](https://swe-agent.com/latest/usage/cli/).

### 46. Firebase Studio workspace creation

- **Status:** Transitional, covered in the main entry because existing workspaces remain accessible for a limited period.
- **Risk:** new workspace creation was disabled on 22 June 2026 and the migration page states a planned shutdown on 22 March 2027.
- **Decision:** do not recommend it as a new foundation despite its strong agent/tool feature set.
- **Evidence:** [migration and sunset](https://firebase.google.com/docs/studio/migrating-project).

## F. Cross-harness feature index

### Model/provider flexibility

- **Strongly model/provider-flexible:** OpenHands, OpenCode, Goose, Cline, Kilo Code, Aider, mini-SWE-agent, Pi, Junie, Factory Droid, Zed Agent, Tabnine Agent.
- **Configurable but ecosystem-centered:** Gemini CLI, Qwen Code, Codex CLI/app, Cursor, Windsurf, Amazon Q, Kiro, Replit Agent, v0, Lovable.
- **Mostly provider-locked or abstracted:** Claude Code, Devin, GitHub Copilot, Sourcegraph Amp.
- **Host-dependent:** Microsoft Playwright MCP, Browser Harness, Anthropic Computer Use Demo when used as a reference, and OpenAI Agents SDK when the application selects the model.

### File read/write and repository work

- **Core capability:** OpenHands, OpenCode, Goose, Aider, Cline, Kilo Code, mini-SWE-agent, Pi, Gemini CLI, Qwen Code, Codex, Claude Code, Cursor, Windsurf, GitHub Copilot, Devin, Replit Agent, Amazon Q, Junie, Factory, Kiro, Zed, Tabnine, Lovable, v0, Firebase Studio.
- **Host/application supplied:** Browser Use, Stagehand, Skyvern, Browser Harness, Playwright MCP, OpenAI Agents SDK, Anthropic Computer Use Demo.

### Shell/terminal

- **First-class:** OpenHands, OpenCode, Goose, Aider, Cline, Kilo Code, mini-SWE-agent, Pi, Gemini CLI, Qwen Code, Codex, Claude Code, Cursor, Windsurf, Copilot CLI, Devin, Replit Agent, Amazon Q, Junie, Factory, Warp, Kiro, Zed, v0, Firebase Studio.
- **Environment-specific:** GitHub Copilot coding agent, Lovable, Browser Use, Stagehand, Skyvern, and Vercel Agent.

### Browser/computer use

- **Native or documented:** Goose, Cline, Kilo Code, Gemini CLI extensions, Claude Code through integrations, Cursor, Windsurf, Devin, Factory, Kiro, v0, Lovable verification tools, Browser Use, Stagehand, Skyvern, OpenAI Agents SDK, Anthropic Computer Use Demo.
- **Browser substrate:** Microsoft Playwright MCP and Browser Harness.
- **Not verified as core:** Aider, mini-SWE-agent, Pi, OpenCode, Qwen Code, Tabnine Agent.

### MCP and external tools

- **First-class MCP:** OpenHands, OpenCode, Goose, Cline, Kilo Code, Gemini CLI, Qwen Code, Codex, Claude Code, Cursor, Windsurf, GitHub Copilot, Amazon Q, Junie, Factory, Kiro, Gemini Code Assist, Zed, Tabnine, Lovable, v0, Firebase Studio, Stagehand, Playwright MCP, OpenAI Agents SDK.
- **Integration-focused but details vary:** Devin, Replit Agent, Augment, Warp, Skyvern.
- **Not verified in core:** Aider, mini-SWE-agent, Pi.

### Skills, rules, hooks, or reusable workflows

- **Strong explicit packaging:** Claude Code, Codex, Cline, Kilo Code, Goose recipes/skills, Gemini CLI, Qwen Code, Cursor, Windsurf, GitHub Copilot, Junie, Factory, Kiro, Zed, Lovable workflows.
- **Rules/context without full skill system:** OpenCode, Continue, Aider, Tabnine, Augment, Warp.
- **Application-defined:** OpenAI Agents SDK, Stagehand, Browser Use, Skyvern, Anthropic Computer Use Demo.

### Subagents, handoffs, and parallel work

- **Explicitly documented:** Goose, Cline, Kilo Code, Gemini CLI, Qwen Code, Claude Code, Codex app/cloud, Cursor background agents, GitHub Copilot variants, Junie, Factory, Kiro, Zed parallel agents, OpenAI Agents SDK.
- **Available but rollout/deployment-dependent:** OpenHands, Devin, Replit Agent, Grok Build.
- **Unknown or not core:** Aider, Continue, Pi core, mini-SWE-agent, Windsurf, Amazon Q, Amp, Augment, Warp, Tabnine, Browser Use local, Stagehand, Skyvern, Playwright MCP, Anthropic demo.

### Session, memory, and context

- **Explicit project/session context:** OpenHands, OpenCode, Goose recipes, Aider repo map/history, Cline checkpoints, Pi sessions/compaction, Gemini CLI memory, Qwen memory/config, Codex AGENTS.md/sessions, Claude CLAUDE.md/auto memory, Cursor rules/index, Windsurf memories, Copilot repository instructions, Devin checkpoints, Junie guidelines, Kiro specs/steering, Zed threads/checkpoints, Tabnine context engine.
- **Cloud/project-centric:** Replit Agent, Lovable, Bolt.new, v0, Firebase Studio, Vercel Agent.
- **Host/application-dependent:** Browser Use, Browser Harness, Stagehand, Skyvern, Playwright MCP, OpenAI Agents SDK, Anthropic demo.

### Permission, approval, and sandbox

- **Granular tool policy:** OpenCode, Continue, Cline, Kilo Code, Qwen Code, Gemini CLI, Claude Code, Cursor, Codex, Zed, Kiro, v0.
- **Sandbox/container emphasis:** OpenHands, mini-SWE-agent, Codex, Devin, Factory, v0, OpenAI Agents SDK, Anthropic demo.
- **Cloud environment policy:** GitHub Copilot coding agent, Devin, Replit Agent, Firebase Studio, Vercel Agent, Browser Use Cloud.
- **Host-dependent:** Browser Harness, Stagehand, Playwright MCP, Skyvern, Warp, Augment, Tabnine.

### Git, worktrees, branches, or pull requests

- **Strong native workflow:** Codex, Claude Code, Cursor, GitHub Copilot, Cline Kanban, Factory, Junie, Kiro, Zed, Lovable, v0.
- **Repository-centric but lower-level:** OpenHands, OpenCode, Goose, Aider, mini-SWE-agent, Pi, Gemini CLI, Qwen Code, Kilo Code.
- **Cloud/project-specific:** Devin, Replit Agent, Firebase Studio, Vercel Agent, Bolt.new.
- **Host-dependent:** Browser/computer-use runtimes.

### Local, self-host, or offline potential

- **Strong local/self-host:** OpenHands, OpenCode, Goose, Aider, Cline, Kilo Code, mini-SWE-agent, Pi, Gemini CLI, Qwen Code, Codex CLI, Zed.
- **Local client with hosted service dependency:** Cursor, Windsurf, Claude Code, Amazon Q, Junie, Tabnine, Augment, Warp.
- **Primarily cloud:** Devin, Replit Agent, Lovable, Bolt.new, v0, Firebase Studio, Vercel Agent.
- **Local or managed browser:** Browser Use, Stagehand, Skyvern, Browser Harness.

## G. Pi Bot fit assessment

### Local artifact baseline

- [package.json](../package.json) pins @earendil-works/pi-coding-agent at 0.84.1 and builds a public-alpha Electron/Vite app.
- [electron/main.mjs](../electron/main.mjs) owns the runtime, model discovery, provider authentication, agent profiles, workspace selection, SessionManager sessions, skills loading, and session model/thinking controls.
- The current runtime passes read, bash, edit, write, grep, find, and ls as coding tools.
- The current app lets agents have isolated app-owned or external workspaces, stores agent instructions in AGENTS.md, and asks before loading external workspace skills.
- [electron/preload.cjs](../electron/preload.cjs) exposes a narrow IPC bridge; the BrowserWindow uses contextIsolation true and nodeIntegration false.
- The current renderer has agent selection, sessions/history, model selection, thinking level, streaming events, tool events, stop, provider authentication, and settings surfaces.
- [docs/mvp-spec.md](mvp-spec.md) now describes the shipped prototype boundary, while [docs/next-stage-spec.md](next-stage-spec.md) separates planned permission/testing work from implemented behavior.
- [docs/design-system.md](design-system.md) documents the combined collapsible agent/session sidebar, conversation/activity hierarchy, compact autosizing composer, themes, and semantic type scale implemented by the renderer.

### Recommended fit lenses

- local-first and self-host potential;
- model/provider neutrality;
- session and context ownership;
- extension surface such as skills, MCP, plugins, and hooks;
- permission/sandbox clarity;
- UI embedding and IPC/API suitability;
- multi-agent and background work;
- browser/computer-use path;
- Git/worktree/PR workflow.

### Highest-fit references for Pi Bot

- **Pi coding agent — highest architectural fit:** already embedded, local, provider-extensible, session-based, and compatible with the existing Electron bridge. The main gap is that advanced orchestration and safety policy are host responsibilities.
- **OpenCode — high fit for permission design:** useful reference for explicit allow/ask/deny rules per tool/resource and provider-agnostic configuration. It is CLI-first, so the UI contract would need adaptation.
- **Goose — high fit for extensibility:** desktop + CLI + API, MCP extensions, recipes, skills, and subagents show a broad local harness model. It is a larger product surface than Pi Bot currently needs.
- **OpenHands — high fit for sandbox/deployment:** strongest reference for containerized execution, Agent Server, remote workspace, and SDK boundaries. It is heavier than a minimal local Electron app.
- **Cline/Kilo Code — high fit for agent profiles:** modes, custom agents, permission-scoped tools, MCP, browser, and subagent context are directly relevant to Pi Bot's agent profile direction. Both are more IDE-centric.
- **Zed Agent — high fit for UI contract:** Agent Profiles, Skills, Instructions, MCP, tool permissions, threads, checkpoints, and parallel agents map cleanly to an agent-first workspace UI.
- **Claude Code/Codex — high fit for safety patterns:** CLAUDE.md/AGENTS.md, skills, subagents, hooks, approvals, sandboxes, and worktrees are useful feature references. Their provider lock and product terms make them poor runtime dependencies for a provider-neutral Pi Bot.
- **Browser Use/Stagehand/Playwright MCP — future browser path:** use only when Pi Bot has a concrete browser workflow and an explicit credential/sandbox policy. Do not add browser controls as a cosmetic feature.

### Capability fit summary

- **Local execution:** Pi, OpenCode, Goose, Cline, Kilo Code, Aider, mini-SWE-agent, Codex CLI, Gemini CLI, Qwen Code, and Zed are strong references.
- **Provider-neutral model layer:** OpenCode, Goose, Cline, Kilo Code, Aider, OpenHands, mini-SWE-agent, Pi, Junie, and Factory are strongest references.
- **Session/history:** Pi already has the correct base with SessionManager; Cline checkpoints, Zed threads, Codex sessions, and Claude compaction are useful UX references.
- **Agent identity/profiles:** Pi already has agentProfiles and AGENTS.md; Kilo, Cline, Zed, Claude, Codex, and Kiro provide mature profile/config patterns.
- **Permission safety:** OpenCode, Qwen Code, Gemini CLI, Codex, Claude Code, Zed, Kilo, and Cline offer the clearest models to borrow.
- **Sandbox/deployment:** OpenHands, mini-SWE-agent, Codex, Factory, and OpenAI Agents SDK are the best references.
- **MCP/extensibility:** Goose, Cline, Kilo, OpenCode, Claude Code, Codex, Zed, and Gemini CLI provide the clearest patterns.
- **Subagents/parallel:** Goose, Cline, Kilo, Claude Code, Codex app, Junie, Factory, Kiro, Zed, and OpenAI Agents SDK provide explicit patterns; adding this to Pi Bot would be a product/security change, not a small UI feature.
- **Browser/computer use:** Browser Use, Stagehand, Playwright MCP, Skyvern, and Anthropic/OpenAI reference harnesses are better sources than coding IDEs.

### Recommendation for Pi Bot

- Keep Pi as the runtime and avoid replacing it with a closed harness.
- Make the existing agent profile, workspace trust, AGENTS.md, skills, model, thinking level, session history, and tool list visible as one capability contract.
- Add a permission policy layer before adding more powerful tools. The current tool list includes bash, edit, and write, so the app needs an explicit allow/ask/deny story if it is going to remain understandable.
- Treat MCP as an extension boundary with per-server approval and visible provenance, following the safer parts of OpenCode, Goose, Cline, Kilo, Zed, and Claude Code.
- Treat subagents, background tasks, browser control, and cloud execution as separate milestones with their own persistence, credential, cancellation, and audit rules.
- Keep the current narrow Electron bridge and main-process runtime boundary. Do not expose Node APIs or arbitrary tool execution directly to the renderer.
- Prefer small, inspectable additions: first a capability/permission model, then an evidence-rich timeline, then optional skills/MCP, then any orchestration.

## H. Watchlist dan exclusion log

### Adjacent, not a complete harness

- **Browserbase:** managed browser infrastructure for Stagehand/custom agents, not the complete model/tool loop. [Docs](https://docs.browserbase.com/use-cases/agents), [pricing](https://www.browserbase.com/pricing).
- **Playwright/Selenium/Puppeteer alone:** browser automation libraries without an agent loop. Playwright MCP is separately included as a tool substrate.
- **Raw OpenAI computer-use API:** model/tool primitive; the application must supply the execution environment and loop. [OpenAI computer-use guide](https://platform.openai.com/docs/guides/tools-computer-use).
- **Raw Anthropic computer-use API:** tool primitive; Anthropic documents the need for a loop, environment, UI, and user confirmation. [Specification](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool).
- **LangGraph, AutoGen, CrewAI, Pydantic AI, OpenAI Agents SDK-like orchestration frameworks:** pure framework entries are outside the primary catalog unless they ship a developer-usable runtime with the full loop. OpenAI Agents SDK is included specifically under that exception.

### End-user products not counted as primary harnesses

- ChatGPT Agent/Operator: end-user product; developer runtime is represented by OpenAI Agents SDK and computer-use tooling.
- Claude desktop/Cowork: end-user product; developer reference is Anthropic Computer Use Demo.
- xAI Grok Bot: end-user bot product; Grok Build is the developer-relevant coding harness.
- Manus and similar end-user assistants: no primary developer-harness evidence was established in this pass.

### Candidates needing a dedicated second pass

- Google Antigravity CLI: official migration references were found through Gemini CLI material, but a feature/source matrix was not verified sufficiently for the main catalog.
- Trae: product exists as a coding IDE/agent candidate; current license, deployment, and primary feature matrix were not sufficiently verified.
- Qoder: product exists as an agent coding candidate; current license, provider, and runtime details were not sufficiently verified.
- Plandex, GPT Pilot, Pythagora, Devika, Sweep, Void, PearAI, and similar projects: include only after a current official release/activity and license check; they were not promoted to active entries from this pass.
- Other narrow enterprise coding agents and internal/private harnesses: excluded because their public primary documentation was incomplete or unavailable.

## I. Riset lanjutan yang paling bernilai

- Pin version/commit untuk setiap open-source repository before making a build or licensing decision.
- Recheck commercial pricing and plan entitlements before purchase; pricing in this document is a dated snapshot.
- Verify actual sandbox/network behavior with runnable bounded tests; documentation alone is not enough for high-risk execution.
- Decide whether Pi Bot should add a read-only/review mode alongside its current write-capable tools before adding more tool power.
- Treat browser credentials, MCP servers, and background agents as security boundaries, not feature checkboxes.
