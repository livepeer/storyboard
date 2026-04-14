# Claude as an Agent Framework for Storyboard

## Problem Statement

The current storyboard is a single-file HTML app (~4000 lines) with a hand-coded "agent" loop: a mega-prompt for planning, static capability routing, fire-and-wait inference, and single-shot re-planning. It works, but is brittle, stateless, and can't reason about failures or adapt mid-workflow.

**Goal:** Use Claude as the agent brain — replacing the hand-coded planner with real reasoning, adding memory, tool-calling loops, and conversational error recovery — while keeping the hosted SDK service as the execution backend.

---

## Architecture A: Claude API Direct — Agent Chat in the Storyboard

### How it works

The storyboard's chat panel talks **directly to Claude API** with tool-use (function calling). The tools are thin wrappers around the SDK service REST endpoints. Claude reasons, plans, calls tools, inspects results, retries — all inside the browser. The system prompt (loaded from a `storyboard-agent.md` file) replaces the hand-coded mega-prompt. No CLI, no MCP, no server-side agent runtime.

```
┌────────────────────────────────────────────────────────────────┐
│  Browser (storyboard.html)                                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Chat Panel (existing)                                    │  │
│  │  User types: "create a dragon, restyle as watercolor,     │  │
│  │               animate to video, start LV2V with rain"     │  │
│  │                                                            │  │
│  │         │                                                  │  │
│  │         ▼                                                  │  │
│  │  ┌─────────────────────────────────────┐                  │  │
│  │  │  Claude API (Messages + Tool Use)    │                  │  │
│  │  │  System: storyboard-agent.md         │                  │  │
│  │  │  Tools:                              │                  │  │
│  │  │   - inference(cap, model, prompt)    │───► SDK Service  │  │
│  │  │   - stream_start(prompt)             │    (REST API)    │  │
│  │  │   - stream_control(id, prompt)       │                  │  │
│  │  │   - canvas_create(type, url, title)  │───► Canvas DOM   │  │
│  │  │   - canvas_get_registry()            │    (local JS)    │  │
│  │  │   - capabilities()                   │───► SDK Service  │  │
│  │  │   - train_lora(images, trigger)      │                  │  │
│  │  └─────────────────────────────────────┘                  │  │
│  │                                                            │  │
│  │  Claude reasons:                                           │  │
│  │   1. capabilities() → pick recraft for illustration        │  │
│  │   2. inference("text-to-image", "recraft", "dragon...")   │  │
│  │   3. canvas_create("image", url, "Dragon")                │  │
│  │   4. inference("img2img", "kontext-edit", "watercolor..")  │  │
│  │   5. canvas_create("image", url, "Watercolor Dragon")     │  │
│  │   6. inference("image-to-video", "kling-i2v", ...)        │  │
│  │   7. canvas_create("video", url, "Dragon Animation")      │  │
│  │   8. stream_start("add rain and lightning")               │  │
│  │   9. → poll status → publish frames → show output         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Infinite Canvas (existing)                                │  │
│  │  Cards, arrows, drag/drop, context menus — unchanged       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────┐
│  SDK Service                    │
│  sdk.daydream.monster           │
│  (existing REST API — no MCP    │
│   needed, just the endpoints    │
│   we already have)              │
└────────────────────────────────┘
```

### How the tool-calling loop works in the browser

```javascript
// In storyboard.html — replaces handleUserMessage()
async function agentChat(userMessage) {
  // Append user message to conversation history
  messages.push({ role: 'user', content: userMessage });

  // Loop: Claude reasons → calls tools → gets results → continues
  while (true) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: AGENT_SYSTEM_PROMPT,  // loaded from storyboard-agent.md
        tools: TOOL_DEFINITIONS,       // inference, canvas_create, etc.
        messages,
      }),
    });
    const data = await response.json();

    // Process each content block
    for (const block of data.content) {
      if (block.type === 'text') {
        addMessage(block.text, 'agent');  // show reasoning in chat
      }
      if (block.type === 'tool_use') {
        addMessage(`Using ${block.name}...`, 'agent');
        const result = await executeTool(block.name, block.input);
        messages.push({ role: 'assistant', content: data.content });
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }],
        });
      }
    }

    // If Claude's done (no more tool calls), break
    if (data.stop_reason === 'end_turn') break;
  }
}

// Tool execution — maps tool names to local functions or SDK calls
async function executeTool(name, input) {
  switch (name) {
    case 'inference':
      return await sdkFetch('/inference', input);
    case 'stream_start':
      return await sdkFetch('/stream/start', input);
    case 'canvas_create':
      return createCardFromAgent(input);  // manipulates DOM directly
    case 'canvas_get_registry':
      return Object.values(registry);     // returns current canvas state
    case 'capabilities':
      return await sdkFetch('/capabilities');
    // ... etc
  }
}
```

### Components

| Component | Role | Implementation |
|-----------|------|----------------|
| **Claude API (browser)** | Agent brain — planning, reasoning, tool-calling loop, error recovery | Direct `fetch()` to `api.anthropic.com/v1/messages` with `tools` parameter |
| **Tool definitions** | JSON schema for each tool (inference, canvas, stream, train) | JS object in storyboard, ~100 lines |
| **System prompt** | Domain knowledge: model catalog, workflow patterns, canvas conventions | `storyboard-agent.md` loaded at startup (or inline) |
| **Canvas tools** | `canvas_create`, `canvas_update`, `canvas_remove`, `canvas_get_registry` | Pure JS functions that manipulate the existing card/registry system |
| **SDK tools** | `inference`, `stream_start`, `stream_control`, `capabilities`, `train_lora` | Thin wrappers around existing `sdkFetch()` calls |
| **Conversation memory** | Message history in `localStorage` — persists across page reloads | Built into the chat panel; includes tool results for Claude to reference |
| **Storyboard HTML** | Canvas + chat — both existing, with `handleUserMessage` replaced by `agentChat` | Replace ~800 lines of planner/executor with ~200 lines of tool-calling loop |

### User Setup

```
1. Open storyboard.html
2. Enter SDK API key (already exists in settings panel)
3. Enter Anthropic API key (new field in settings panel)
4. Start chatting — Claude is the agent
```

No CLI. No install. No MCP. Just a browser.

### Pros

- **Chat agent lives in the storyboard** — user talks to Claude in the same chat panel, sees results on the same canvas
- **Zero infrastructure** — no MCP server, no WebSocket bridge, no local CLI; just browser + API keys
- **Canvas tools are local JS** — Claude calls `canvas_create` and it directly manipulates the DOM, zero latency
- **Full reasoning visible** — Claude's thinking appears in the chat panel as it plans and executes
- **Error recovery is conversational** — Claude sees tool errors, reasons about them, asks the user or retries
- **Minimal code change** — replace `handleUserMessage` with `agentChat`; keep everything else
- **Claude picks the right model** — instead of regex-based capability routing, Claude queries `/capabilities` and reasons about which model fits best
- **Multi-turn context** — Claude remembers prior results in the conversation; "now restyle that image" works naturally
- **Streaming** — Claude API supports streaming; agent thinking appears in real-time
- **Cheapest path** — Sonnet 4.6 at $3/$15 per M tokens; a 10-step workflow is ~$0.01

### Cons

- **Anthropic API key in browser** — requires `anthropic-dangerous-direct-browser-access` header; API key is visible in browser devtools. Mitigate: proxy through SDK service.
- **No persistent memory across sessions** — conversation resets on page reload (unless saved to localStorage)
- **No ecosystem** — no plugins, skills, or hooks from Claude Code; everything is in the system prompt
- **Rate limits** — Anthropic API rate limits apply; heavy workflows may hit them
- **Token cost for long sessions** — conversation grows; 50+ tool calls means large context

### API key security: proxy option

To avoid exposing the Anthropic key in the browser, route through the SDK service:

```
Storyboard → POST sdk.daydream.monster/agent/chat
           → SDK service proxies to api.anthropic.com with server-side key
           → Returns Claude response (including tool_use blocks)
           → Storyboard executes tools locally + via SDK
```

This adds ~50ms latency per turn but keeps the API key server-side.

---

## Architecture A-alt: Claude Code Official (MCP + Skills + Hooks)

### How it works

For users who prefer the CLI/IDE experience: the hosted SDK service becomes an **MCP server**. Claude Code connects to it natively. CLAUDE.md provides domain knowledge. A WebSocket bridge MCP tool pushes canvas updates to the storyboard browser.

```
┌─────────────────────────────────────────────────────────┐
│  User's Machine                                          │
│                                                          │
│  ┌──────────────┐    ┌──────────────────────────────┐   │
│  │ Claude Code   │◄──►│ SDK Service MCP Server        │   │
│  │ (CLI / IDE)   │    │ (sdk.daydream.monster/mcp)    │   │
│  │               │    │                                │   │
│  │ Tools:        │    │ Tools exposed:                 │   │
│  │  mcp__sdk__*  │    │  - inference(model, prompt)    │   │
│  │  Read/Write   │    │  - stream_start(prompt)        │   │
│  │  Bash         │    │  - stream_control(prompt)      │   │
│  │  WebFetch     │    │  - train_lora(images, params)  │   │
│  │               │    │  - capabilities()              │   │
│  │ Context:      │    └──────────────────────────────┘   │
│  │  CLAUDE.md    │                                       │
│  │  Skills/      │    ┌──────────────────────────────┐   │
│  │  Hooks/       │◄──►│ Canvas MCP (local stdio)      │   │
│  └──────┬───────┘    │  - create_card → WS → browser │   │
│         │             │  - get_registry → WS → browser│   │
│         │             └──────────────┬───────────────┘   │
│         │                            │ WebSocket          │
│         │                            ▼                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Storyboard (localhost:3000)                        │   │
│  │ Canvas + WS client — no chat panel needed          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Pros

- Full Claude Code ecosystem (plugins, skills, hooks, memory, subagents)
- IDE integration (VS Code, JetBrains)
- Persistent memory across sessions (built-in)

### Cons

- Requires local CLI install
- Chat is in terminal, not in storyboard
- Needs MCP server implementation + canvas bridge

---

## Architecture B: Claude Code Source Fork (Custom Agent Runtime)

### How it works

Fork the Claude Code source (`github.com/seanhanca/claude-code`), strip down to the agent runtime core, and embed it directly in a custom Node.js server. The storyboard connects via WebSocket. The forked runtime handles tool-calling, memory, and planning — but with custom tools hardwired for the SDK service (no MCP overhead).

```
┌─────────────────────────────────────────────────────────┐
│  Server (can be cloud-hosted or local)                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Custom Agent Runtime (forked Claude Code core)    │   │
│  │                                                    │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌───────────┐  │   │
│  │  │ Tool System │  │ Memory/State│  │ Planner   │  │   │
│  │  │ (hardwired) │  │ (file-based)│  │ (Claude   │  │   │
│  │  │             │  │             │  │  API)     │  │   │
│  │  │ - inference │  │ - sessions  │  │           │  │   │
│  │  │ - stream    │  │ - prefs     │  │           │  │   │
│  │  │ - train     │  │ - history   │  │           │  │   │
│  │  │ - canvas    │  │             │  │           │  │   │
│  │  └─────┬──────┘  └─────────────┘  └───────────┘  │   │
│  │        │                                           │   │
│  │        ▼                                           │   │
│  │  SDK Service (sdk.daydream.monster)                 │   │
│  └──────────────────────────┬───────────────────────┘   │
│                             │ WebSocket                  │
│                             ▼                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Storyboard (browser)                              │   │
│  │  - Renders canvas from WS state updates            │   │
│  │  - Sends user messages via WS                      │   │
│  │  - Receives card create/update/remove commands     │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Components

| Component | Role | Implementation |
|-----------|------|----------------|
| **Agent Runtime** | Forked Claude Code core: tool-calling loop, context management, subagent spawning | TypeScript/Bun, extracted from `claude-code/src/` |
| **Custom Tools** | Direct SDK service calls (no MCP overhead) — `inference`, `stream_start`, `canvas_update`, etc. | Hardwired in the runtime, call SDK REST API directly |
| **Canvas Controller** | Tool that sends card operations (create, update, remove, layout) to the browser via WebSocket | Custom tool in the runtime |
| **Memory** | File-based persistent memory (same as Claude Code's `~/.claude/memory/`) | Reuse the memory system from the fork |
| **Storyboard HTML** | Thin client: renders canvas from WS commands, sends user chat messages upstream | Strip all AI logic; add WS client for bidirectional state sync |
| **WebSocket Bridge** | Real-time bidirectional: runtime → canvas updates; browser → user messages + media events | Node.js WS server in the agent runtime |

### User Setup

```bash
# 1. Clone and run the agent server
git clone https://github.com/seanhanca/storyboard-agent
cd storyboard-agent
ANTHROPIC_API_KEY=sk-ant-... SDK_URL=https://sdk.daydream.monster npm start

# 2. Open storyboard in browser
# Server auto-serves storyboard at http://localhost:3000
```

### Pros

- **Full browser integration** — agent directly controls the canvas via WebSocket; no file/bridge hacks
- **Lower latency** — direct SDK calls, no MCP protocol overhead
- **Hostable as a service** — can deploy the agent server to cloud; users just open a URL
- **Custom UI** — can add agent-specific UI (thinking indicators, step-by-step plan display, approval dialogs)
- **No local CLI required** — pure web experience
- **Full control** — can modify the tool-calling loop, add custom planning strategies, implement approval workflows

### Cons

- **Maintenance burden** — forked code diverges from upstream Claude Code; must manually port improvements
- **Significant engineering** — extracting the agent core from Claude Code is non-trivial (compiled Bun binary, minified JS, undocumented internals)
- **API key management** — need to handle Anthropic API keys server-side (security concern if hosted)
- **License risk** — Claude Code source license may restrict forking for production use
- **Loses ecosystem** — no access to Claude Code plugins, skills marketplace, IDE integrations
- **Reinventing wheels** — permission system, hook system, MCP ecosystem — all need to be rebuilt or abandoned

---

## Comparison Matrix

| Dimension | A: In-Browser Claude API | A-alt: Claude Code + MCP | B: Source Fork |
|-----------|--------------------------|--------------------------|----------------|
| **Setup complexity** | Low (just API keys) | Medium (CLI + MCP config) | High (clone, build, deploy) |
| **User experience** | Chat in storyboard canvas | CLI/IDE-driven; canvas passive | Pure web; full custom UX |
| **Engineering effort** | Low (~200 lines to replace planner) | Medium (MCP server + bridge) | Very High (extract core) |
| **Maintenance** | Low (just API calls) | Low (Anthropic maintains CC) | High (manual upstream sync) |
| **Latency per tool call** | ~50ms (canvas local, SDK direct) | ~200ms (MCP overhead) | ~50ms (direct call) |
| **Browser integration** | Native (same page) | Indirect (WS bridge) | Native (WebSocket) |
| **Memory/persistence** | localStorage (basic) | Built-in (Claude Code memory) | Must reimplement |
| **Ecosystem access** | None (standalone) | Full (plugins, skills, MCP) | None |
| **Multi-user hosting** | Yes (proxy API key via SDK) | No (single-user CLI) | Yes (server-hosted) |
| **Cost per workflow** | ~$0.01 (Sonnet) | ~$0.01 (Sonnet) | ~$0.01 (Sonnet) + server |
| **License safety** | Official API, safe | Official product, safe | Fork — check terms |
| **Time to prototype** | 3-5 days | 1-2 weeks | 4-8 weeks |
| **10x improvement potential** | 9x | 7x (CLI UX gap) | 10x (full control) |

---

## Recommendation

### Use Architecture A (In-Browser Claude API) as the primary approach

**Why:**
1. **Fastest to value.** Replace `handleUserMessage` with a Claude tool-calling loop — 3-5 days to working prototype. No MCP, no bridge, no CLI.
2. **Best UX.** Agent chat is in the storyboard. User talks to Claude, sees cards appear on the canvas, asks follow-up questions. Natural and immediate.
3. **Canvas tools are free.** `canvas_create` is just a JS function call — Claude directly manipulates the DOM through the tool result → no latency, no bridge.
4. **Existing SDK endpoints are the tools.** No MCP server needed. The tool implementations are literally the existing `sdkFetch()` wrappers.
5. **Multi-turn reasoning built-in.** Claude sees prior tool results in conversation context. "Now restyle that dragon" just works — Claude knows which card/URL to reference.

### API key strategy

**Phase 1 (prototype):** User enters Anthropic API key in storyboard settings. Uses `anthropic-dangerous-direct-browser-access` header. Fast to build, fine for developer users.

**Phase 2 (production):** Add `/agent/chat` proxy endpoint to SDK service. Storyboard sends user message → SDK service calls Claude API with server-side key → returns tool_use blocks → storyboard executes tools locally. User only needs SDK API key (which they already have).

### Also support A-alt for power users

Power users who prefer CLI/IDE can still use Claude Code + MCP. Build the MCP server as a later addition (the SDK endpoints already exist; MCP is just a protocol wrapper). Both approaches share the same SDK backend.

### Concrete next steps

1. **Define tool schemas** (1 day)
   - 7 tools: `inference`, `stream_start`, `stream_control`, `stream_stop`, `train_lora`, `capabilities`, `canvas_create`
   - JSON schema for each (input params + descriptions for Claude)

2. **Write agent system prompt** (1 day)
   - `storyboard-agent.md`: model catalog, workflow patterns, canvas conventions
   - Replace the 250-line `ENRICH_SYSTEM_PROMPT` with a cleaner Claude-native prompt
   - Include examples of multi-step tool-calling workflows

3. **Build `agentChat()` loop** (2 days)
   - Replace `handleUserMessage` with Claude Messages API tool-calling loop
   - Stream Claude responses to chat panel in real-time
   - Execute tools: SDK tools via `sdkFetch()`, canvas tools via local JS
   - Persist conversation in localStorage

4. **Add canvas tools** (1 day)
   - `canvas_create({type, url, title, depends_on})` → creates card, adds arrow, updates registry
   - `canvas_get_registry()` → returns all cards with their URLs and types
   - `canvas_update({refId, ...changes})` → update existing card

5. **Add Anthropic key to settings panel** (0.5 day)
   - New field next to existing SDK key
   - Store in localStorage like the SDK key

6. **Test and iterate** (2-3 days)
   - "Create a dragon, restyle as watercolor, animate to video"
   - Error recovery: model 404 → Claude picks alternative
   - Context menus: right-click → "restyle" → opens chat with context pre-filled

---

## Appendix: Architecture A — MCP Tool Definitions

```python
# SDK MCP Server — tool examples

@mcp_tool("inference")
async def inference(
    capability: str,       # e.g. "text-to-image", "image-to-video"
    model: str = "",       # optional specific model
    prompt: str = "",
    image_url: str = "",   # for img2img
    video_url: str = "",   # for v2v
    params: dict = {},     # model-specific params
) -> dict:
    """Run AI inference. Returns {image_url, video_url, audio_url, metadata}."""

@mcp_tool("stream_start")
async def stream_start(
    prompt: str,
    pipeline: str = "longlive",
) -> dict:
    """Start an LV2V stream. Returns {stream_id, status_url}."""

@mcp_tool("stream_control")
async def stream_control(
    stream_id: str,
    prompt: str,
) -> dict:
    """Update the prompt on a running LV2V stream."""

@mcp_tool("capabilities")
async def capabilities() -> list[dict]:
    """List available AI models and their capabilities."""

@mcp_tool("train_lora")
async def train_lora(
    images: list[str],     # URLs or base64
    trigger_word: str,
    steps: int = 1000,
) -> dict:
    """Start LoRA training. Returns {job_id, status_url}."""
```

## Appendix: Architecture B — Source Fork Risks

The Claude Code source at `github.com/seanhanca/claude-code` is the compiled binary + bundled JS. Key risks:

1. **Not actual source** — the repo likely contains the distributed binary, not buildable source. The real source is internal to Anthropic.
2. **Minified/bundled** — the JS inside the binary is webpack-bundled and minified; extracting the agent core would require decompilation.
3. **License** — Claude Code's license (check `LICENSE` in the repo) may prohibit modification or redistribution.
4. **API coupling** — the agent runtime is tightly coupled to Anthropic's internal APIs, authentication, and telemetry.
5. **Bun runtime** — compiled as a single Bun executable; extracting requires Bun-specific tooling.

**Recommendation:** If a custom runtime is needed, build it from scratch using the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) instead of forking Claude Code. The Agent SDK provides a clean, documented, supported API for building custom agents with Claude.
