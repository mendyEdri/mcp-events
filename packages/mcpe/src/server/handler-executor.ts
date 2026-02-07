import { spawn, type ChildProcess } from 'child_process';
import type {
  MCPEvent,
  EventHandler,
  BashHandlerArgs,
  WebhookHandlerArgs,
} from '../types/index.js';
import { isBashHandler, isWebhookHandler, isAgentHandler } from '../types/index.js';

/**
 * Result of executing a handler
 */
export interface HandlerResult {
  success: boolean;
  handlerType: string;
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
  handler: EventHandler,
  subscriptionId: string
) => Promise<void>;

/**
 * Callback for custom handlers - implementers can register their own handler types
 */
export type CustomHandlerCallback = (
  event: MCPEvent,
  handler: EventHandler,
  subscriptionId: string
) => Promise<{ output?: string }>;

/**
 * Handler executor configuration
 */
export interface HandlerExecutorConfig {
  /** Callback for agent handlers (required if using agent handlers) */
  onAgentHandler?: AgentHandlerCallback;
  /** Registry of custom handler callbacks by type */
  customHandlers?: Record<string, CustomHandlerCallback>;
  /** Default timeout for handlers in ms */
  defaultTimeout?: number;
}

/**
 * Executes event handlers (webhook, bash, agent, or custom)
 *
 * Supports the open handler schema where handlers have `type` + `args`.
 * Built-in types: "bash", "agent", "webhook"
 * Custom types: Registered via customHandlers config
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
   * Register a custom handler type
   */
  registerHandler(type: string, callback: CustomHandlerCallback): void {
    this.config.customHandlers = this.config.customHandlers || {};
    this.config.customHandlers[type] = callback;
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
      // Built-in handler types
      if (isWebhookHandler(handler)) {
        return await this.executeWebhook(event, handler.args || {}, startTime);
      }
      if (isBashHandler(handler)) {
        return await this.executeBash(event, handler.args || {}, startTime);
      }
      if (isAgentHandler(handler)) {
        return await this.executeAgent(event, handler, subscriptionId, startTime);
      }

      // Check for custom handler
      const customHandler = this.config.customHandlers?.[handler.type];
      if (customHandler) {
        return await this.executeCustom(event, handler, subscriptionId, customHandler, startTime);
      }

      // Unknown handler type
      return {
        success: false,
        handlerType: handler.type,
        error: `Unknown handler type: ${handler.type}. Register custom handlers via HandlerExecutor.registerHandler()`,
        durationMs: Date.now() - startTime,
      };
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
    args: Partial<WebhookHandlerArgs>,
    startTime: number
  ): Promise<HandlerResult> {
    if (!args.url) {
      return {
        success: false,
        handlerType: 'webhook',
        error: 'Webhook handler requires "url" in args',
        durationMs: Date.now() - startTime,
      };
    }

    const timeout = args.timeout ?? this.config.defaultTimeout!;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(args.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...args.headers,
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
    args: Partial<BashHandlerArgs>,
    startTime: number
  ): Promise<HandlerResult> {
    if (!args.command) {
      return {
        success: false,
        handlerType: 'bash',
        error: 'Bash handler requires "command" in args',
        durationMs: Date.now() - startTime,
      };
    }

    const timeout = args.timeout ?? this.config.defaultTimeout!;

    return new Promise((resolve) => {
      const env: Record<string, string> = {
        ...process.env,
        ...args.env,
        MCPE_EVENT_ID: event.id,
        MCPE_EVENT_TYPE: event.type,
        MCPE_EVENT_SOURCE: event.metadata.source,
        MCPE_EVENT_PRIORITY: event.metadata.priority,
        MCPE_EVENT_TIMESTAMP: event.metadata.timestamp,
        MCPE_EVENT_DATA: JSON.stringify(event.data),
        MCPE_EVENT_JSON: JSON.stringify(event),
      };

      // Add tags if present
      if (event.metadata.tags) {
        env.MCPE_EVENT_TAGS = event.metadata.tags.join(',');
      }

      const cmdArgs = args.args ?? [];
      const input = args.input ?? 'stdin';
      const command = args.command!;  // Already validated above

      // If input mode is 'args', append event JSON as last argument
      const finalArgs = input === 'args'
        ? [...cmdArgs, JSON.stringify(event)]
        : cmdArgs;

      const child: ChildProcess = spawn(command, finalArgs, {
        cwd: args.cwd,
        env,
        shell: true,
        timeout,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Send event JSON to stdin if input mode is 'stdin'
      if (input === 'stdin') {
        child.stdin?.write(JSON.stringify(event));
        child.stdin?.end();
      }

      child.on('close', (code: number | null) => {
        resolve({
          success: code === 0,
          handlerType: 'bash',
          output: stdout || stderr,
          error: code !== 0 ? `Exit code ${code}: ${stderr}` : undefined,
          durationMs: Date.now() - startTime,
        });
      });

      child.on('error', (error: Error) => {
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
    handler: EventHandler,
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

  /**
   * Execute a custom handler
   */
  private async executeCustom(
    event: MCPEvent,
    handler: EventHandler,
    subscriptionId: string,
    callback: CustomHandlerCallback,
    startTime: number
  ): Promise<HandlerResult> {
    try {
      const result = await callback(event, handler, subscriptionId);
      return {
        success: true,
        handlerType: handler.type,
        output: result.output,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        handlerType: handler.type,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }
}
