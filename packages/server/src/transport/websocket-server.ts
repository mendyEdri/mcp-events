import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  ServerTransportOptions,
} from '@esmcp/core';

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  initialized: boolean;
}

export interface WebSocketServerTransportEvents {
  connection: (client: ClientConnection) => void;
  message: (client: ClientConnection, message: JsonRpcRequest) => void;
  disconnect: (client: ClientConnection) => void;
  error: (error: Error) => void;
}

export class WebSocketServerTransport {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private listeners: Map<
    keyof WebSocketServerTransportEvents,
    Set<Function>
  > = new Map();

  constructor(private options: ServerTransportOptions) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.options.port,
          host: this.options.host,
          path: this.options.path,
        });

        this.wss.on('listening', () => {
          resolve();
        });

        this.wss.on('connection', (ws) => {
          const client: ClientConnection = {
            id: uuidv4(),
            ws,
            initialized: false,
          };

          this.clients.set(client.id, client);
          this.emit('connection', client);

          ws.on('message', (data) => {
            try {
              const message = JSON.parse(data.toString()) as JsonRpcRequest;
              this.emit('message', client, message);
            } catch (error) {
              this.emit('error', new Error('Failed to parse message'));
            }
          });

          ws.on('close', () => {
            this.clients.delete(client.id);
            this.emit('disconnect', client);
          });

          ws.on('error', (error) => {
            this.emit('error', error);
          });
        });

        this.wss.on('error', (error) => {
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.wss) {
        resolve();
        return;
      }

      // Close all client connections
      this.clients.forEach((client) => {
        client.ws.close();
      });
      this.clients.clear();

      this.wss.close((error) => {
        if (error) {
          reject(error);
        } else {
          this.wss = null;
          resolve();
        }
      });
    });
  }

  send(
    clientId: string,
    message: JsonRpcResponse | JsonRpcNotification
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      return Promise.reject(new Error('Client not found'));
    }

    return new Promise((resolve, reject) => {
      client.ws.send(JSON.stringify(message), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  broadcast(message: JsonRpcNotification): void {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.initialized) {
        client.ws.send(data);
      }
    });
  }

  getClient(clientId: string): ClientConnection | undefined {
    return this.clients.get(clientId);
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  isClientConnected(clientId: string): boolean {
    const client = this.clients.get(clientId);
    return !!client && client.ws.readyState === WebSocket.OPEN;
  }

  markInitialized(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.initialized = true;
    }
  }

  on<K extends keyof WebSocketServerTransportEvents>(
    event: K,
    listener: WebSocketServerTransportEvents[K]
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  off<K extends keyof WebSocketServerTransportEvents>(
    event: K,
    listener: WebSocketServerTransportEvents[K]
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
    }
  }

  private emit<K extends keyof WebSocketServerTransportEvents>(
    event: K,
    ...args: Parameters<WebSocketServerTransportEvents[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((listener) => {
        (listener as Function)(...args);
      });
    }
  }
}
