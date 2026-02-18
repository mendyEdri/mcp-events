# AI SDK Agent with ASP Subscription Tools

This example demonstrates how to use the [Vercel AI SDK](https://sdk.vercel.ai/) with the Agent Subscription Protocol (ASP), allowing an AI agent to manage event subscriptions through natural language.

## How It Works

The AI agent has access to ASP tools that let it:
- **Discover** available event sources and capabilities
- **Subscribe** to events based on user requests
- **Unsubscribe** when no longer needed
- **Pause/Resume** subscriptions temporarily
- **Check** received events

### Tools Available

| Tool | Description |
|------|-------------|
| `asp_get_capabilities` | Discover what event sources are available |
| `asp_subscribe` | Subscribe to events with filters |
| `asp_unsubscribe` | Remove a subscription |
| `asp_list_subscriptions` | List current subscriptions |
| `asp_pause_subscription` | Temporarily pause delivery |
| `asp_resume_subscription` | Resume a paused subscription |
| `asp_check_events` | See recent received events |

## Usage

### Prerequisites

1. Start the ASP server:
```bash
cd ../agent-subscription
npx tsx server.ts
```

2. Set your API key:
```bash
# For Anthropic (default)
export ANTHROPIC_API_KEY=your-key

# Or for OpenAI
export OPENAI_API_KEY=your-key
```

### Run the Demo Agent

```bash
# Install dependencies
pnpm install

# Run with Anthropic (default)
pnpm start

# Or with OpenAI
pnpm start -- --provider openai
```

### Interactive Mode

Chat with the agent in real-time:

```bash
pnpm run interactive
```

Example conversation:
```
👤 You: What event sources are available?
🤖 Agent: Let me check... The available event sources are GitHub, Gmail, Slack, and custom events.

👤 You: Subscribe to all GitHub events
🤖 Agent: I've subscribed you to all GitHub events using the pattern "github.*". You'll now receive notifications for pushes, pull requests, issues, and more.

👤 You: I'm going into a meeting, pause that
🤖 Agent: Done! I've paused your GitHub subscription. You won't receive any events until you resume it.

👤 You: Meeting's over, resume it
🤖 Agent: Resumed! Your GitHub subscription is active again.
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI SDK Agent                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  generateText()                       │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │              ASP Tools                        │   │   │
│  │  │  subscribe | unsubscribe | pause | resume    │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   ASPClient                           │   │
│  │           (with WebSocketTransport)                   │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       ASP Server                             │
│              (Event Hub with subscriptions)                  │
└─────────────────────────────────────────────────────────────┘
```

## Creating Your Own Tools

The tool pattern follows AI SDK conventions:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'What this tool does (for LLM to understand)',
  parameters: z.object({
    param1: z.string().describe('Description for LLM'),
    param2: z.number().optional(),
  }),
  execute: async ({ param1, param2 }) => {
    // Your logic here
    return { result: 'success' };
  },
});
```

## Integration with MCP

This example shows how ASP complements MCP:

- **MCP**: Agent uses tools to access resources and perform actions
- **ASP**: Agent subscribes to events that trigger those actions

```typescript
// MCP: Define tools
const mcpTools = {
  github_comment: tool({...}),
  slack_message: tool({...}),
};

// ASP: Subscribe to events
const aspTools = createASPTools(aspClient);

// Combined: Agent can both listen and act
const result = await generateText({
  model,
  tools: { ...mcpTools, ...aspTools },
  prompt: "Monitor GitHub issues and respond to new ones",
});
```

## License

MIT
