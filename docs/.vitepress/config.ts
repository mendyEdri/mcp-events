import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'MCP Events (MCPE)',
  description: 'Real-time event subscriptions for MCP-compatible agents.',
  base: '/mcp-events/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/introduction' },
      { text: 'API Reference', link: '/api/server-api' },
      { text: 'Specification', link: '/specification' },
      { text: 'GitHub', link: 'https://github.com/mendyEdri/mcp-events' },
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/introduction' },
          { text: 'Quickstart', link: '/quickstart' },
          { text: 'Why MCPE?', link: '/why-mcpe' },
        ],
      },
      {
        text: 'Core Concepts',
        items: [
          { text: 'Protocol', link: '/concepts/protocol' },
          { text: 'Events', link: '/concepts/events' },
          { text: 'Subscriptions', link: '/concepts/subscriptions' },
          { text: 'Transports', link: '/concepts/transports' },
        ],
      },
      {
        text: 'Server SDK',
        items: [
          { text: 'Getting Started', link: '/server/getting-started' },
          { text: 'Publishing Events', link: '/server/publishing-events' },
          { text: 'Delivery Modes', link: '/server/delivery' },
          { text: 'Configuration', link: '/server/configuration' },
        ],
      },
      {
        text: 'Client SDK',
        items: [
          { text: 'Getting Started', link: '/client/getting-started' },
          { text: 'Subscribing', link: '/client/subscribing' },
          { text: 'Event Handlers', link: '/client/event-handlers' },
          { text: 'Scheduling', link: '/client/scheduling' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Server API', link: '/api/server-api' },
          { text: 'Client API', link: '/api/client-api' },
          { text: 'Types', link: '/api/types' },
          { text: 'Protocol Methods', link: '/api/protocol-methods' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'MCP Integration', link: '/guides/mcp-integration' },
          { text: 'Examples', link: '/guides/examples' },
        ],
      },
      {
        text: 'Specification',
        items: [
          { text: 'MCPE Specification', link: '/specification' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mendyEdri/mcp-events' },
    ],
    search: {
      provider: 'local',
    },
    footer: {
      message: 'Released under the MIT License.',
    },
  },
})
