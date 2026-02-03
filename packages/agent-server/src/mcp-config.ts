import { z } from 'zod';

// MCP Server configuration schema
export const MCPServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export const MCPConfigSchema = z.object({
  mcpServers: z.record(MCPServerConfigSchema),
});

export type MCPConfig = z.infer<typeof MCPConfigSchema>;

// In-memory MCP configuration store
let mcpConfig: MCPConfig = {
  mcpServers: {},
};

// Tool definition for the agent
export interface AgentTool {
  name: string;
  description: string;
  enabled: boolean;
  source: 'builtin' | 'mcp';
  mcpServer?: string;
}

// Built-in tools registry
const builtinTools: AgentTool[] = [
  {
    name: 'connectToEventHub',
    description: 'Connect to an MCPE EventHub server to enable event subscriptions',
    enabled: true,
    source: 'builtin',
  },
  {
    name: 'getServerCapabilities',
    description: 'Get the capabilities of the connected MCPE EventHub server',
    enabled: true,
    source: 'builtin',
  },
  {
    name: 'subscribe',
    description: 'Subscribe to events with real-time delivery (immediate notifications)',
    enabled: true,
    source: 'builtin',
  },
  {
    name: 'subscribeCron',
    description: 'Subscribe with recurring scheduled delivery (daily digest, weekly report, hourly summary)',
    enabled: true,
    source: 'builtin',
  },
  {
    name: 'subscribeScheduled',
    description: 'Subscribe with one-time scheduled delivery (remind me in X hours, next Sunday)',
    enabled: true,
    source: 'builtin',
  },
  {
    name: 'listSubscriptions',
    description: 'List all current active subscriptions',
    enabled: true,
    source: 'builtin',
  },
  {
    name: 'unsubscribe',
    description: 'Remove a subscription by its ID',
    enabled: true,
    source: 'builtin',
  },
];

// Custom tools added by users
let customTools: AgentTool[] = [];

// Tool enabled states (persisted separately)
const toolEnabledStates: Map<string, boolean> = new Map();

export function getMCPConfig(): MCPConfig {
  return mcpConfig;
}

export function setMCPConfig(config: MCPConfig): void {
  mcpConfig = config;
}

export function getMCPServer(name: string): MCPServerConfig | undefined {
  return mcpConfig.mcpServers[name];
}

export function addMCPServer(name: string, config: MCPServerConfig): void {
  mcpConfig.mcpServers[name] = config;
}

export function removeMCPServer(name: string): boolean {
  if (mcpConfig.mcpServers[name]) {
    delete mcpConfig.mcpServers[name];
    // Also remove any tools from this MCP server
    customTools = customTools.filter(t => t.mcpServer !== name);
    return true;
  }
  return false;
}

export function enableMCPServer(name: string, enabled: boolean): boolean {
  if (mcpConfig.mcpServers[name]) {
    mcpConfig.mcpServers[name].enabled = enabled;
    return true;
  }
  return false;
}

export function listMCPServers(): Array<{ name: string; config: MCPServerConfig }> {
  return Object.entries(mcpConfig.mcpServers).map(([name, config]) => ({
    name,
    config,
  }));
}

export function getAllTools(): AgentTool[] {
  const tools = [...builtinTools, ...customTools];
  // Apply enabled states
  return tools.map(tool => ({
    ...tool,
    enabled: toolEnabledStates.has(tool.name)
      ? toolEnabledStates.get(tool.name)!
      : tool.enabled,
  }));
}

export function getEnabledTools(): AgentTool[] {
  return getAllTools().filter(t => t.enabled);
}

export function addCustomTool(tool: Omit<AgentTool, 'source'>): void {
  customTools.push({ ...tool, source: 'mcp' });
}

export function removeCustomTool(name: string): boolean {
  const index = customTools.findIndex(t => t.name === name);
  if (index !== -1) {
    customTools.splice(index, 1);
    toolEnabledStates.delete(name);
    return true;
  }
  return false;
}

export function setToolEnabled(name: string, enabled: boolean): boolean {
  const allTools = getAllTools();
  const tool = allTools.find(t => t.name === name);
  if (tool) {
    toolEnabledStates.set(name, enabled);
    return true;
  }
  return false;
}

export function importMCPConfig(jsonConfig: unknown): { success: boolean; error?: string } {
  try {
    const parsed = MCPConfigSchema.parse(jsonConfig);
    mcpConfig = parsed;
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid configuration format'
    };
  }
}

export function exportMCPConfig(): MCPConfig {
  return mcpConfig;
}
