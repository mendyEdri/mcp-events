import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { runAgent } from './agent.js';
import { getMCPEInstance } from './mcpe-integration.js';

// Request validation schemas
const RegisterRequestSchema = z.object({
  mcpeUrl: z.string().url().optional(),
  filter: z.object({
    sources: z.array(z.enum(['github', 'gmail', 'slack', 'custom'])).optional(),
    eventTypes: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    priority: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional(),
  }).optional(),
  prompt: z.string().optional(),
});

type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

// Create Hono app
export function createApp(): Hono {
  const app = new Hono();

  // Enable CORS
  app.use('*', cors());

  // Health check endpoint
  app.get('/health', (c) => {
    const mcpe = getMCPEInstance();
    return c.json({
      status: 'ok',
      connected: mcpe.isConnected(),
      connectionUrl: mcpe.getConnectionUrl(),
      timestamp: new Date().toISOString(),
    });
  });

  // Register endpoint - request agent to subscribe to events
  app.post('/register', async (c) => {
    try {
      const body = await c.req.json();
      const parseResult = RegisterRequestSchema.safeParse(body);

      if (!parseResult.success) {
        return c.json(
          {
            success: false,
            error: 'Invalid request',
            details: parseResult.error.errors,
          },
          400
        );
      }

      const request: RegisterRequest = parseResult.data;

      // Build the user message for the agent
      let userMessage: string;
      if (request.prompt) {
        userMessage = request.prompt;
      } else if (request.filter) {
        const parts: string[] = ['Subscribe to events'];
        if (request.filter.sources?.length) {
          parts.push(`from ${request.filter.sources.join(', ')}`);
        }
        if (request.filter.eventTypes?.length) {
          parts.push(`with types: ${request.filter.eventTypes.join(', ')}`);
        }
        if (request.filter.tags?.length) {
          parts.push(`tagged: ${request.filter.tags.join(', ')}`);
        }
        if (request.filter.priority?.length) {
          parts.push(`priority: ${request.filter.priority.join(', ')}`);
        }
        userMessage = parts.join(' ');
      } else {
        userMessage = 'Subscribe to all available events';
      }

      const result = await runAgent({
        userMessage,
        mcpeUrl: request.mcpeUrl,
      });

      if (result.success) {
        return c.json({
          success: true,
          subscriptionId: result.subscriptionId,
          agentDecision: result.message,
          subscriptionInfo: result.subscriptionInfo,
        });
      } else {
        return c.json(
          {
            success: false,
            error: result.error,
            agentDecision: result.message,
          },
          500
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // List subscriptions endpoint
  app.get('/subscriptions', async (c) => {
    try {
      const mcpe = getMCPEInstance();
      const subscriptions = await mcpe.listSubscriptions();

      return c.json({
        success: true,
        connected: mcpe.isConnected(),
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          filter: s.filter,
          eventCount: s.eventCount,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // Unsubscribe endpoint
  app.delete('/subscriptions/:id', async (c) => {
    try {
      const subscriptionId = c.req.param('id');
      const mcpe = getMCPEInstance();

      if (!mcpe.isConnected()) {
        return c.json(
          {
            success: false,
            error: 'Not connected to MCPE EventHub',
          },
          400
        );
      }

      const success = await mcpe.unsubscribe(subscriptionId);

      return c.json({
        success,
        subscriptionId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // Agent chat endpoint - more flexible interaction
  app.post('/chat', async (c) => {
    try {
      const body = await c.req.json();
      const { message, mcpeUrl } = body as { message?: string; mcpeUrl?: string };

      if (!message) {
        return c.json(
          {
            success: false,
            error: 'Message is required',
          },
          400
        );
      }

      const result = await runAgent({
        userMessage: message,
        mcpeUrl,
      });

      return c.json({
        success: result.success,
        message: result.message,
        subscriptionId: result.subscriptionId,
        error: result.error,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  return app;
}
