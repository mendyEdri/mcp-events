/**
 * MCPE Client for Browser/Chrome Extension
 * Connects to an MCPE agent-server via Server-Sent Events
 */
class MCPEClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    this.eventSource = null;
    this.connected = false;
    this.handlers = new Map();
    this.connectionHandlers = { connect: [], disconnect: [], error: [], event: [] };
    this.reconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 1000;
    this.reconnectTimer = null;
  }

  /**
   * Connect to the MCPE server via SSE
   */
  async connect() {
    if (this.eventSource) {
      console.log('[MCPE] Already connected or connecting');
      return;
    }

    return new Promise((resolve, reject) => {
      const url = `${this.serverUrl}/chat/events`;
      console.log('[MCPE] Connecting to:', url);

      try {
        this.eventSource = new EventSource(url);
      } catch (error) {
        console.error('[MCPE] Failed to create EventSource:', error);
        reject(error);
        return;
      }

      const timeout = setTimeout(() => {
        if (!this.connected) {
          console.error('[MCPE] Connection timeout');
          this.eventSource?.close();
          this.eventSource = null;
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      // Standard SSE message handler (data: {...})
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[MCPE] Message received:', data);

          if (data.type === 'connected') {
            this.connected = true;
            this.reconnectAttempts = 0;
            clearTimeout(timeout);
            console.log('[MCPE] Connected!');
            this.emit('connect', {});
            resolve();
          } else if (data.type === 'response') {
            // Delayed response from agent
            this.emit('event', data);
            this.handlers.forEach((handler, pattern) => {
              if (this.matchPattern(data.eventType || 'response', pattern)) {
                handler(data);
              }
            });
          } else if (data.type === 'event') {
            // Generic event
            this.emit('event', data);
            this.handlers.forEach((handler, pattern) => {
              if (this.matchPattern(data.eventType || data.type, pattern)) {
                handler(data);
              }
            });
          }
        } catch (error) {
          console.log('[MCPE] Non-JSON message:', event.data);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('[MCPE] EventSource error:', error);
        clearTimeout(timeout);

        if (!this.connected) {
          this.eventSource?.close();
          this.eventSource = null;
          reject(new Error('Connection failed'));
        } else {
          this.connected = false;
          this.emit('disconnect', { reason: 'Connection lost' });
          this.handleReconnect();
        }
      };

      this.eventSource.onopen = () => {
        console.log('[MCPE] EventSource opened');
      };
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.reconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
    console.log('[MCPE] Disconnected');
  }

  /**
   * Subscribe to events via the API
   */
  async subscribe(options = {}) {
    const { filter = {}, name = 'browser-subscription' } = options;

    const response = await fetch(`${this.serverUrl}/api/mcpe/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        filter,
        handler: { type: 'notification' },
        enabled: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Subscribe failed: ${error}`);
    }

    return response.json();
  }

  /**
   * List subscriptions from server
   */
  async listSubscriptions() {
    const response = await fetch(`${this.serverUrl}/api/mcpe/subscriptions`);
    if (!response.ok) {
      throw new Error(`List subscriptions failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Toggle subscription enabled state
   */
  async toggleSubscription(name, enabled) {
    const response = await fetch(`${this.serverUrl}/api/mcpe/subscriptions/${encodeURIComponent(name)}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (!response.ok) {
      throw new Error(`Toggle failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(name) {
    const response = await fetch(`${this.serverUrl}/api/mcpe/subscriptions/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Publish an event to the server
   */
  async publish(eventType, data = {}, source = 'browser') {
    const response = await fetch(`${this.serverUrl}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: eventType,
        data,
        source
      })
    });

    if (!response.ok) {
      throw new Error(`Publish failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Send a chat message
   */
  async chat(message) {
    const response = await fetch(`${this.serverUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Register event handler for specific event types
   */
  onEvent(pattern, handler) {
    this.handlers.set(pattern, handler);
    return () => this.handlers.delete(pattern);
  }

  /**
   * Register connection event handlers
   */
  on(event, handler) {
    if (this.connectionHandlers[event]) {
      this.connectionHandlers[event].push(handler);
    }
    return () => {
      const handlers = this.connectionHandlers[event];
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) handlers.splice(index, 1);
      }
    };
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.eventSource !== null;
  }

  /**
   * Get connection state
   */
  getState() {
    if (!this.eventSource) return 'disconnected';
    if (!this.connected) return 'connecting';
    return 'connected';
  }

  // Private methods

  matchPattern(eventType, pattern) {
    if (pattern === '*') return true;
    if (pattern === eventType) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -1);
      return eventType.startsWith(prefix);
    }
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(eventType);
    }
    return false;
  }

  emit(event, data) {
    const handlers = this.connectionHandlers[event];
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[MCPE] ${event} handler error:`, error);
        }
      });
    }
  }

  handleReconnect() {
    if (!this.reconnect) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[MCPE] Max reconnect attempts reached');
      this.emit('error', { message: 'Max reconnect attempts reached' });
      return;
    }

    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts);
    console.log(`[MCPE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.eventSource = null;
      this.connected = false;
      this.connect().catch((error) => {
        console.error('[MCPE] Reconnect failed:', error);
      });
    }, delay);
  }
}

// Export for use in popup.js
window.MCPEClient = MCPEClient;
