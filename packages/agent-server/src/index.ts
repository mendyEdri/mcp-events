import { serve } from '@hono/node-server';
import { createApp } from './server.js';

const PORT = parseInt(process.env.PORT ?? '8080', 10);

const app = createApp();

console.log(`Starting MCPE Agent Server on port ${PORT}...`);

serve({
  fetch: app.fetch,
  port: PORT,
});

console.log(`MCPE Agent Server is running at http://localhost:${PORT}`);
console.log(`  - Health check: GET /health`);
console.log(`  - Register subscription: POST /register`);
console.log(`  - List subscriptions: GET /subscriptions`);
console.log(`  - Chat with agent: POST /chat`);
