# Livepeer LLM Provider — Design Spec

> **Branch:** `feat/creative-workflow-tool`
> **Goal:** A production-grade `LivepeerProvider` that routes all LLM calls (including tool calling) through Livepeer's BYOC infrastructure, supporting Gemini, Claude, OpenAI, and OpenRouter as backend models — all through a single Daydream API key.

---

## 1. Problem

Today, the agent framework calls LLM providers directly:
```
Browser → /api/agent/gemini → Google API (needs GEMINI_API_KEY)
Browser → /api/agent/chat   → Anthropic API (needs ANTHROPIC_API_KEY)
Browser → /api/agent/openai → OpenAI API (needs OPENAI_API_KEY)
```

Each needs a separate API key, separate billing, separate rate limits.

**Target state:**
```
Browser → SDK /llm/chat → BYOC Orch → Gemini / Claude / OpenAI / OpenRouter
                           (one Daydream API key, one billing path)
```

---

## 2. Architecture

### New SDK Endpoint: `/llm/chat`

A new endpoint on the SDK service (app.py) that accepts the **OpenAI chat completions format** — the de facto standard. This format is supported natively by OpenAI, and via adapters by Gemini, Claude, and OpenRouter.

```
POST /llm/chat
{
  "model": "gemini-2.5-flash",        // or "claude-sonnet-4-6", "gpt-4o", "openrouter/..."
  "messages": [
    {"role": "system", "content": "You are a creative assistant"},
    {"role": "user", "content": "Create a sunset image"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "generate_image",
        "description": "Generate an image",
        "parameters": {"type": "object", "properties": {"prompt": {"type": "string"}}}
      }
    }
  ],
  "stream": false
}
```

**Response** (OpenAI format):
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "I'll create that for you!",
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {"name": "generate_image", "arguments": "{\"prompt\":\"sunset over ocean\"}"}
      }]
    },
    "finish_reason": "tool_calls"
  }],
  "usage": {"prompt_tokens": 150, "completion_tokens": 42}
}
```

**Why OpenAI format:** It's the standard. Gemini has an OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai/`). Claude has one via Anthropic's API. OpenRouter uses it natively. One format, all backends.

### Model Routing

The SDK maps model names to BYOC capabilities:

| Model name | BYOC capability | Backend |
|-----------|----------------|---------|
| `gemini-2.5-flash` | `gemini-text` | Gemini API |
| `gemini-2.5-pro` | `gemini-text-pro` | Gemini API |
| `claude-sonnet-4-6` | `claude-sonnet` | Anthropic API |
| `gpt-4o` | `openai-gpt4o` | OpenAI API |
| `openrouter/*` | `openrouter` | OpenRouter API |

The inference adapter on the BYOC orch handles the format translation per backend. Each backend registers as a BYOC capability with its own fal/API adapter.

### LivepeerProvider (Client)

```typescript
class LivepeerProvider implements LLMProvider {
  readonly name = "livepeer";

  async *call(req: LLMRequest): AsyncIterable<LLMChunk> {
    // 1. Translate LLMRequest → OpenAI chat format
    // 2. POST to SDK /llm/chat
    // 3. Parse OpenAI response → yield LLMChunks
  }
}
```

---

## 3. Implementation Plan

### Phase 1: LivepeerProvider with OpenAI-format proxy (storyboard side)

**What:** Build the LivepeerProvider that sends OpenAI-format requests to a new `/api/llm/chat` Next.js route, which proxies to the SDK.

**Files:**
- `lib/agents/livepeer-provider.ts` — rewrite to use OpenAI chat format
- `app/api/llm/chat/route.ts` — Next.js proxy route (injects Daydream API key)
- `tests/unit/livepeer-provider.test.ts` — unit tests with mock responses

### Phase 2: SDK endpoint `/llm/chat` (SDK side)

**What:** Add `/llm/chat` to app.py that translates OpenAI format → Gemini API call via BYOC.

**Files:**
- `simple-infra/sdk-service-build/app.py` — new endpoint
- Uses existing `gemini-text` BYOC capability but passes full chat format

### Phase 3: Multi-model support (BYOC side)

**What:** Register Claude, OpenAI, OpenRouter as BYOC capabilities with model-specific adapters.

**This is infrastructure work — separate from the storyboard repo.**

---

## 4. Phase 1 Detail: LivepeerProvider

### LivepeerProvider rewrite

```typescript
export class LivepeerProvider implements LLMProvider {
  readonly name = "livepeer";
  readonly tiers: Tier[] = [0, 1, 2, 3];

  constructor(private config: {
    proxyUrl?: string;      // default: "/api/llm/chat"
    model?: string;         // default: "gemini-2.5-flash"
    models?: Partial<Record<Tier, string>>;  // per-tier model override
  } = {}) {}

  async *call(req: LLMRequest): AsyncIterable<LLMChunk> {
    const model = this.config.models?.[req.tier]
      ?? this.config.model
      ?? "gemini-2.5-flash";

    // Translate to OpenAI format
    const body = {
      model,
      messages: translateMessages(req.messages),
      tools: req.tools.length > 0 ? translateTools(req.tools) : undefined,
      temperature: req.temperature,
      max_tokens: req.max_tokens,
    };

    const resp = await fetch(this.config.proxyUrl ?? "/api/llm/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Parse OpenAI response → LLMChunks
    const data = await resp.json();
    const choice = data.choices?.[0];
    if (!choice) { yield { kind: "error", error: "No response" }; return; }

    const msg = choice.message;
    if (msg.content) yield { kind: "text", text: msg.content };

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        yield { kind: "tool_call_start", id: tc.id, name: tc.function.name };
        yield { kind: "tool_call_args", id: tc.id, args_delta: tc.function.arguments };
        yield { kind: "tool_call_end", id: tc.id };
      }
    }

    if (data.usage) {
      yield { kind: "usage", usage: {
        input: data.usage.prompt_tokens ?? 0,
        output: data.usage.completion_tokens ?? 0,
      }};
    }

    yield { kind: "done" };
  }
}
```

### Message Translation

```typescript
function translateMessages(messages: Message[]): OpenAIMessage[] {
  return messages.map(m => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id, type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      };
    }
    return { role: m.role, content: m.content };
  });
}

function translateTools(tools: ToolSchema[]): OpenAITool[] {
  return tools.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
```

### Next.js Proxy Route

```typescript
// app/api/llm/chat/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  const sdkUrl = process.env.SDK_URL || "https://sdk.daydream.monster";
  const apiKey = process.env.DAYDREAM_API_KEY || "";

  const resp = await fetch(`${sdkUrl}/llm/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}
```

### Unit Tests

```typescript
// tests/unit/livepeer-provider.test.ts
describe("LivepeerProvider", () => {
  it("translates LLMRequest to OpenAI format");
  it("parses text response into LLMChunks");
  it("parses tool_calls into tool_call_start/args/end chunks");
  it("extracts usage from response");
  it("handles error responses");
  it("supports per-tier model selection");
});
```

### E2E Test

```typescript
// tests/e2e/livepeer-provider.spec.ts
test("LivepeerProvider generates text via SDK", async ({ page }) => {
  // Configure to use LivepeerProvider
  // Send a simple prompt
  // Verify text response appears in chat
});

test("LivepeerProvider tool calling works", async ({ page }) => {
  // Send "create an image of a cat"
  // Verify create_media tool is called
  // Verify image card appears
});
```

---

## 5. SDK Endpoint Design (`/llm/chat`)

### Request Flow

```
POST /llm/chat
  → Parse OpenAI format body
  → Map model name → BYOC capability
  → If Gemini: translate to Gemini generateContent format
  → If Claude: translate to Anthropic messages format
  → If OpenAI: pass through to OpenAI API
  → If OpenRouter: pass through (OpenAI-compatible)
  → Submit via BYOC
  → Translate response back to OpenAI format
  → Return
```

### Model → Backend Mapping

```python
MODEL_BACKENDS = {
    "gemini-2.5-flash": {"capability": "gemini-text", "backend": "gemini"},
    "gemini-2.5-pro": {"capability": "gemini-text-pro", "backend": "gemini"},
    "claude-sonnet-4-6": {"capability": "claude-sonnet", "backend": "anthropic"},
    "gpt-4o": {"capability": "openai-gpt4o", "backend": "openai"},
}

# OpenRouter models pass through with "openrouter/" prefix
# e.g., "openrouter/meta-llama/llama-3.1-70b"
```

### Gemini Translation

```python
def openai_to_gemini(body):
    """Translate OpenAI chat format → Gemini generateContent format."""
    contents = []
    system_text = ""
    for msg in body["messages"]:
        if msg["role"] == "system":
            system_text += msg["content"]
        elif msg["role"] == "user":
            contents.append({"role": "user", "parts": [{"text": msg["content"]}]})
        elif msg["role"] == "assistant":
            parts = []
            if msg.get("content"):
                parts.append({"text": msg["content"]})
            for tc in msg.get("tool_calls", []):
                parts.append({"functionCall": {
                    "name": tc["function"]["name"],
                    "args": json.loads(tc["function"]["arguments"]),
                }})
            contents.append({"role": "model", "parts": parts})
        elif msg["role"] == "tool":
            contents.append({"role": "user", "parts": [{
                "functionResponse": {
                    "name": msg.get("name", ""),
                    "response": json.loads(msg["content"]),
                }
            }]})

    gemini_body = {"contents": contents}
    if system_text:
        gemini_body["systemInstruction"] = {"parts": [{"text": system_text}]}
    if body.get("tools"):
        gemini_body["tools"] = [{"functionDeclarations": [
            {"name": t["function"]["name"],
             "description": t["function"]["description"],
             "parameters": t["function"]["parameters"]}
            for t in body["tools"]
        ]}]
    return gemini_body

def gemini_to_openai(gemini_resp):
    """Translate Gemini response → OpenAI chat format."""
    candidate = gemini_resp.get("candidates", [{}])[0]
    parts = candidate.get("content", {}).get("parts", [])

    content = None
    tool_calls = []
    for part in parts:
        if "text" in part:
            content = (content or "") + part["text"]
        if "functionCall" in part:
            tool_calls.append({
                "id": f"call_{uuid4().hex[:8]}",
                "type": "function",
                "function": {
                    "name": part["functionCall"]["name"],
                    "arguments": json.dumps(part["functionCall"].get("args", {})),
                },
            })

    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls

    usage_meta = gemini_resp.get("usageMetadata", {})
    return {
        "choices": [{"message": message, "finish_reason": "tool_calls" if tool_calls else "stop"}],
        "usage": {
            "prompt_tokens": usage_meta.get("promptTokenCount", 0),
            "completion_tokens": usage_meta.get("candidatesTokenCount", 0),
        },
    }
```

---

## 6. Success Criteria

1. **LivepeerProvider passes same E2E tests as GeminiProvider** — text generation, tool calling, token tracking
2. **No separate Gemini API key needed** — works with Daydream API key only
3. **Model switchable at runtime** — `new LivepeerProvider({ model: "claude-sonnet-4-6" })`
4. **OpenAI format is the standard** — all backends translate to/from it
5. **Zero @livepeer/agent changes** — LivepeerProvider is just another LLMProvider implementation

---

## 7. Implementation Order

| Step | What | Where | Effort |
|------|------|-------|--------|
| 1 | Rewrite LivepeerProvider with OpenAI format | `lib/agents/livepeer-provider.ts` | Small |
| 2 | Add `/api/llm/chat` proxy route | `app/api/llm/chat/route.ts` | Small |
| 3 | Unit tests for LivepeerProvider | `tests/unit/livepeer-provider.test.ts` | Small |
| 4 | Add `/llm/chat` to SDK app.py (Gemini backend) | `simple-infra/sdk-service-build/app.py` | Medium |
| 5 | E2E test: LivepeerProvider through full stack | `tests/e2e/livepeer-provider.spec.ts` | Medium |
| 6 | Register Claude/OpenAI/OpenRouter BYOC capabilities | BYOC orch config | Infra work |
| 7 | Register LivepeerProvider as storyboard plugin | `app/page.tsx` | Small |

Steps 1-3 can be done now (storyboard side).
Steps 4-5 require SDK deployment.
Steps 6-7 are future capabilities.
