import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from './messages.js';

export type TransportState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TransportEvents {
  connect: () => void;
  disconnect: (reason?: string) => void;
  error: (error: Error) => void;
  message: (message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification) => void;
}

export interface Transport {
  readonly state: TransportState;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification): Promise<void>;

  on<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): void;
  off<K extends keyof TransportEvents>(event: K, listener: TransportEvents[K]): void;
}

export interface ClientTransportOptions {
  url: string;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface ServerTransportOptions {
  port: number;
  host?: string;
  path?: string;
}

export interface APNSTransportOptions {
  teamId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
  sandbox?: boolean;
}
