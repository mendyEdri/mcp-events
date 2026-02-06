import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const API_KEY = process.env.API_KEY || '';
const IMAGE_DIR = '/tmp/generated-images';

// Ensure output directory exists
if (!existsSync(IMAGE_DIR)) {
  mkdirSync(IMAGE_DIR, { recursive: true });
}

const server = new Server(
  { name: 'fireworks-image', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_image',
      description:
        'Generate an image from a text prompt using the Flux Dev model. Returns a URL to the generated image.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate',
          },
          aspect_ratio: {
            type: 'string',
            description: 'Aspect ratio (e.g. "16:9", "1:1", "9:16")',
            default: '16:9',
          },
          guidance_scale: {
            type: 'number',
            description: 'How closely to follow the prompt (1-20)',
          },
          num_inference_steps: {
            type: 'number',
            description: 'Number of inference steps (1-50)',
          },
        },
        required: ['prompt'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'generate_image') {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
      isError: true,
    };
  }

  const args = request.params.arguments as {
    prompt: string;
    aspect_ratio?: string;
    guidance_scale?: number;
    num_inference_steps?: number;
  };

  if (!API_KEY) {
    return {
      content: [{ type: 'text', text: 'Error: FIREWORKS_API_KEY is not configured' }],
      isError: true,
    };
  }

  try {
    const body: Record<string, unknown> = {
      prompt: args.prompt,
      aspect_ratio: args.aspect_ratio || '16:9',
    };
    if (args.guidance_scale !== undefined) body.guidance_scale = args.guidance_scale;
    if (args.num_inference_steps !== undefined) body.num_inference_steps = args.num_inference_steps;

    const response = await fetch(
      'https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'image/jpeg',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [{ type: 'text', text: `Fireworks API error (${response.status}): ${errorText}` }],
        isError: true,
      };
    }

    // API returns raw JPEG bytes when Accept: image/jpeg
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    const filename = `${randomUUID()}.jpg`;
    const filePath = join(IMAGE_DIR, filename);
    writeFileSync(filePath, imageBuffer);

    const url = `/generated/${filename}`;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ filename, url, prompt: args.prompt }),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error generating image: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Fireworks Image MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
