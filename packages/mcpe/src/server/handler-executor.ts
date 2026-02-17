import { spawn } from 'child_process';
import type { MCPEvent, EventHandler, BashEventHandler, WebhookEventHandler, AgentEventHandler } from '../types/index.js';

/**
 * Result of executing a handler
 */
export interface HandlerResult {
  success: boolean;
  handlerType: 'bash' | 'webhook' | 'agent';
  /** Output from bash command or webhook response */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Callback for agent handlers - implementers must provide their own LLM invocation
 */
export type AgentHandlerCallback = (
  event: MCPEvent,
  handler: AgentEventHandler,
  subscriptionId: string
) => Promise<void>;

/**
 * Handler executor configuration
 */
export interface HandlerExecutorConfig {
  /** Callback for agent handlers (required if using agent handlers) */
  onAgentHandler?: AgentHandlerCallback;
  /** Default timeout for handlers in ms */
  defaultTimeout?: number;
}

/**
 * Executes event handlers (webhook, bash, agent)
 */
export class HandlerExecutor {
  private config: HandlerExecutorConfig;

  constructor(config: HandlerExecutorConfig = {}) {
    this.config = {
      defaultTimeout: 30000,
      ...config,
    };
  }

  /**
   * Execute a handler for an event
   */
  async execute(
    event: MCPEvent,
    handler: EventHandler,
    subscriptionId: string
  ): Promise<HandlerResult> {
    const startTime = Date.now();

    try {
      switch (handler.type) {
        case 'webhook':
          return await this.executeWebhook(event, handler, startTime);
        case 'bash':
          return await this.executeBash(event, handler, startTime);
        case 'agent':
          return await this.executeAgent(event, handler, subscriptionId, startTime);
        default:
          return {
            success: false,
            handlerType: (handler as any).type,
            error: `Unknown handler type: ${(handler as any).type}`,
            durationMs: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        success: false,
        handlerType: handler.type,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a webhook handler
   */
  private async executeWebhook(
    event: MCPEvent,
    handler: WebhookEventHandler,
    startTime: number
  ): Promise<HandlerResult> {
    const timeout = handler.timeout ?? this.config.defaultTimeout!;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(handler.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...handler.headers,
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();

      if (!response.ok) {
        return {
          success: false,
          handlerType: 'webhook',
          error: `HTTP ${response.status}: ${responseText}`,
          output: responseText,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        handlerType: 'webhook',
        output: responseText,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          handlerType: 'webhook',
          error: `Timeout after ${timeout}ms`,
          durationMs: Date.now() - startTime,
        };
      }

      throw error;
    }
  }

  /**
   * Execute a bash handler
   */
  private async executeBash(
    event: MCPEvent,
    handler: BashEventHandler,
    startTime: number
  ): Promise<HandlerResult> {
    const timeout = handler.timeout ?? this.config.defaultTimeout!;

    return new Promise((resolve) => {
      const env: Record<string, string> = {
        ...process.env,
        ...handler.env,
        MCPE_EVENT_ID: event.id,
        MCPE_EVENT_TYPE: event.type,
        MCPE_EVENT_PRIORITY: event.metadata.priority,
        MCPE_EVENT_TIMESTAMP: event.metadata.timestamp,
        MCPE_EVENT_DATA: JSON.stringify(event.data),
        MCPE_EVENT_JSON: JSON.stringify(event),
      };

      // Add tags if present
      if (event.metadata.tags) {
        env.MCPE_EVENT_TAGS = event.metadata.tags.join(',');
      }

      const args = handler.args ?? [];

      // If input mode is 'args', append event JSON as last argument
      const finalArgs = handler.input === 'args'
        ? [...args, JSON.stringify(event)]
        : args;

      const child = spawn(handler.command, finalArgs, {
        cwd: handler.cwd,
        env,
        shell: true,
        timeout,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Send event JSON to stdin if input mode is 'stdin'
      if (handler.input === 'stdin' || !handler.input) {
        child.stdin?.write(JSON.stringify(event));
        child.stdin?.end();
      }

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          handlerType: 'bash',
          output: stdout || stderr,
          error: code !== 0 ? `Exit code ${code}: ${stderr}` : undefined,
          durationMs: Date.now() - startTime,
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          handlerType: 'bash',
          error: error.message,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Execute an agent handler (delegates to callback)
   */
  private async executeAgent(
    event: MCPEvent,
    handler: AgentEventHandler,
    subscriptionId: string,
    startTime: number
  ): Promise<HandlerResult> {
    if (!this.config.onAgentHandler) {
      return {
        success: false,
        handlerType: 'agent',
        error: 'No agent handler callback configured. Set onAgentHandler in HandlerExecutorConfig.',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      await this.config.onAgentHandler(event, handler, subscriptionId);
      return {
        success: true,
        handlerType: 'agent',
        output: 'Agent handler invoked',
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        handlerType: 'agent',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }
}
