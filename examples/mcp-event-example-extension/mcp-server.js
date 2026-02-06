/**
 * In-Extension MCP Server
 *
 * This MCP server runs inside the Chrome extension and:
 * - Captures all browser push notifications
 * - Exposes notifications via MCP tools
 * - Allows subscribing to real-time notification events
 */

class ExtensionMCPServer {
  constructor() {
    this.notifications = [];
    this.maxNotifications = 100;
    this.subscribers = new Map(); // port -> subscriber info
    this.requestId = 0;

    // Server info
    this.serverInfo = {
      name: 'browser-push-mcp-server',
      version: '1.0.0',
      capabilities: {
        tools: {},
        resources: {},
        notifications: {}
      }
    };

    // Available tools
    this.tools = [
      {
        name: 'list_notifications',
        description: 'List recent browser push notifications',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of notifications to return (default: 20)',
              default: 20
            },
            since: {
              type: 'string',
              description: 'ISO timestamp to filter notifications after this time'
            }
          }
        }
      },
      {
        name: 'get_notification',
        description: 'Get a specific notification by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The notification ID'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'clear_notifications',
        description: 'Clear all stored notifications',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_notification_stats',
        description: 'Get statistics about received notifications',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'subscribe_notifications',
        description: 'Subscribe to real-time notification events (returns subscription ID)',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'object',
              description: 'Optional filter for notification types',
              properties: {
                titlePattern: { type: 'string' },
                sourcePattern: { type: 'string' }
              }
            }
          }
        }
      }
    ];

    // Bind methods
    this.handleMessage = this.handleMessage.bind(this);
    this.addNotification = this.addNotification.bind(this);
  }

  /**
   * Initialize the MCP server
   */
  init() {
    // Listen for connections from MCP clients (via chrome.runtime)
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === 'mcp') {
        console.log('[MCP Server] Client connected');
        this.handleClientConnect(port);
      }
    });

    // Also listen for one-off messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'mcp-request') {
        this.handleRequest(message.request).then(sendResponse);
        return true; // Keep channel open for async response
      }
    });

    console.log('[MCP Server] Initialized');
  }

  /**
   * Handle a new MCP client connection
   */
  handleClientConnect(port) {
    const clientId = `client-${Date.now()}`;

    this.subscribers.set(clientId, {
      port,
      filter: null,
      connectedAt: new Date().toISOString()
    });

    port.onMessage.addListener((message) => {
      this.handleMessage(message, clientId, port);
    });

    port.onDisconnect.addListener(() => {
      console.log('[MCP Server] Client disconnected:', clientId);
      this.subscribers.delete(clientId);
    });

    // Send welcome message
    port.postMessage({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: {
        level: 'info',
        message: 'Connected to Browser Push MCP Server'
      }
    });
  }

  /**
   * Handle incoming MCP message
   */
  async handleMessage(message, clientId, port) {
    console.log('[MCP Server] Received:', message);

    if (!message.jsonrpc || message.jsonrpc !== '2.0') {
      return this.sendError(port, message.id, -32600, 'Invalid Request');
    }

    try {
      const result = await this.handleRequest(message);
      if (message.id !== undefined) {
        port.postMessage(result);
      }
    } catch (error) {
      this.sendError(port, message.id, -32603, error.message);
    }
  }

  /**
   * Handle MCP request
   */
  async handleRequest(request) {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(id, params);

      case 'tools/list':
        return this.handleToolsList(id);

      case 'tools/call':
        return this.handleToolCall(id, params);

      case 'resources/list':
        return this.handleResourcesList(id);

      case 'resources/read':
        return this.handleResourceRead(id, params);

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        };
    }
  }

  /**
   * Handle initialize request
   */
  handleInitialize(id, params) {
    console.log('[MCP Server] Initialize from:', params?.clientInfo?.name);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: this.serverInfo,
        capabilities: this.serverInfo.capabilities
      }
    };
  }

  /**
   * Handle tools/list request
   */
  handleToolsList(id) {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: this.tools }
    };
  }

  /**
   * Handle tools/call request
   */
  async handleToolCall(id, params) {
    const { name, arguments: args } = params;

    let result;
    switch (name) {
      case 'list_notifications':
        result = this.listNotifications(args);
        break;

      case 'get_notification':
        result = this.getNotification(args);
        break;

      case 'clear_notifications':
        result = this.clearNotifications();
        break;

      case 'get_notification_stats':
        result = this.getNotificationStats();
        break;

      case 'subscribe_notifications':
        result = this.subscribeNotifications(args);
        break;

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown tool: ${name}` }
        };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    };
  }

  /**
   * Handle resources/list request
   */
  handleResourcesList(id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        resources: [
          {
            uri: 'notifications://recent',
            name: 'Recent Notifications',
            description: 'List of recent browser push notifications',
            mimeType: 'application/json'
          },
          {
            uri: 'notifications://stats',
            name: 'Notification Statistics',
            description: 'Statistics about received notifications',
            mimeType: 'application/json'
          }
        ]
      }
    };
  }

  /**
   * Handle resources/read request
   */
  handleResourceRead(id, params) {
    const { uri } = params;

    let content;
    switch (uri) {
      case 'notifications://recent':
        content = JSON.stringify(this.listNotifications({ limit: 50 }), null, 2);
        break;

      case 'notifications://stats':
        content = JSON.stringify(this.getNotificationStats(), null, 2);
        break;

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown resource: ${uri}` }
        };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        contents: [{ uri, mimeType: 'application/json', text: content }]
      }
    };
  }

  // ==================== Tool Implementations ====================

  /**
   * List notifications
   */
  listNotifications(args = {}) {
    let { limit = 20, since } = args;

    let filtered = this.notifications;

    if (since) {
      const sinceDate = new Date(since);
      filtered = filtered.filter(n => new Date(n.timestamp) > sinceDate);
    }

    return {
      notifications: filtered.slice(-limit).reverse(),
      total: this.notifications.length,
      returned: Math.min(limit, filtered.length)
    };
  }

  /**
   * Get a specific notification
   */
  getNotification(args) {
    const { id } = args;
    const notification = this.notifications.find(n => n.id === id);

    if (!notification) {
      return { error: 'Notification not found', id };
    }

    return { notification };
  }

  /**
   * Clear all notifications
   */
  clearNotifications() {
    const count = this.notifications.length;
    this.notifications = [];
    return { cleared: count, message: `Cleared ${count} notifications` };
  }

  /**
   * Get notification statistics
   */
  getNotificationStats() {
    const bySource = {};
    const byHour = {};

    this.notifications.forEach(n => {
      // By source
      const source = n.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;

      // By hour
      const hour = new Date(n.timestamp).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;
    });

    return {
      total: this.notifications.length,
      bySource,
      byHour,
      oldest: this.notifications[0]?.timestamp,
      newest: this.notifications[this.notifications.length - 1]?.timestamp
    };
  }

  /**
   * Subscribe to notifications (for long-polling clients)
   */
  subscribeNotifications(args = {}) {
    const subscriptionId = `sub-${Date.now()}`;
    return {
      subscriptionId,
      message: 'Subscribed to notifications. New notifications will be sent via notifications/event method.',
      filter: args.filter || null
    };
  }

  // ==================== Notification Management ====================

  /**
   * Add a new notification (called when push notification received)
   */
  addNotification(notification) {
    const enrichedNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...notification,
      timestamp: notification.timestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString()
    };

    this.notifications.push(enrichedNotification);

    // Trim old notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(-this.maxNotifications);
    }

    // Notify all subscribers
    this.broadcastNotification(enrichedNotification);

    // Store in chrome.storage for persistence
    this.persistNotifications();

    console.log('[MCP Server] Notification added:', enrichedNotification.id);
    return enrichedNotification;
  }

  /**
   * Broadcast notification to all connected clients
   */
  broadcastNotification(notification) {
    const message = {
      jsonrpc: '2.0',
      method: 'notifications/event',
      params: {
        type: 'push_notification',
        notification
      }
    };

    this.subscribers.forEach((subscriber, clientId) => {
      try {
        // Apply filter if set
        if (subscriber.filter) {
          if (subscriber.filter.titlePattern) {
            const regex = new RegExp(subscriber.filter.titlePattern, 'i');
            if (!regex.test(notification.title)) return;
          }
          if (subscriber.filter.sourcePattern) {
            const regex = new RegExp(subscriber.filter.sourcePattern, 'i');
            if (!regex.test(notification.source)) return;
          }
        }

        subscriber.port.postMessage(message);
      } catch (error) {
        console.error('[MCP Server] Failed to send to client:', clientId, error);
      }
    });
  }

  /**
   * Persist notifications to storage
   */
  async persistNotifications() {
    try {
      await chrome.storage.local.set({
        mcpNotifications: this.notifications.slice(-50) // Keep last 50
      });
    } catch (error) {
      console.error('[MCP Server] Failed to persist notifications:', error);
    }
  }

  /**
   * Load notifications from storage
   */
  async loadNotifications() {
    try {
      const data = await chrome.storage.local.get(['mcpNotifications']);
      if (data.mcpNotifications) {
        this.notifications = data.mcpNotifications;
        console.log('[MCP Server] Loaded', this.notifications.length, 'notifications');
      }
    } catch (error) {
      console.error('[MCP Server] Failed to load notifications:', error);
    }
  }

  /**
   * Send error response
   */
  sendError(port, id, code, message) {
    port.postMessage({
      jsonrpc: '2.0',
      id,
      error: { code, message }
    });
  }
}

// Create and export the server instance
const mcpServer = new ExtensionMCPServer();

// Initialize when script loads
if (typeof chrome !== 'undefined' && chrome.runtime) {
  mcpServer.init();
  mcpServer.loadNotifications();
}
