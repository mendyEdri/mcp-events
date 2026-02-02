import * as http2 from 'node:http2';
import type { APNSTransportOptions } from '@esmcp/core';
import { JWTManager } from './jwt.js';
import type { APNSNotification } from '../notifications/builder.js';

export interface APNSResponse {
  status: number;
  apnsId?: string;
  reason?: string;
  timestamp?: number;
}

export interface APNSClientOptions extends APNSTransportOptions {
  maxConcurrent?: number;
  connectionTimeout?: number;
}

const APNS_PRODUCTION_HOST = 'api.push.apple.com';
const APNS_SANDBOX_HOST = 'api.sandbox.push.apple.com';

export class APNSClient {
  private jwtManager: JWTManager;
  private session: http2.ClientHttp2Session | null = null;
  private host: string;
  private bundleId: string;
  private connecting: Promise<void> | null = null;
  private connectionTimeout: number;

  constructor(options: APNSClientOptions) {
    this.jwtManager = new JWTManager({
      teamId: options.teamId,
      keyId: options.keyId,
      privateKey: options.privateKey,
    });

    this.host = options.sandbox ? APNS_SANDBOX_HOST : APNS_PRODUCTION_HOST;
    this.bundleId = options.bundleId;
    this.connectionTimeout = options.connectionTimeout ?? 10000;
  }

  async connect(): Promise<void> {
    if (this.session && !this.session.closed) {
      return;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.connectionTimeout);

      this.session = http2.connect(`https://${this.host}:443`);

      this.session.on('connect', () => {
        clearTimeout(timeout);
        this.connecting = null;
        resolve();
      });

      this.session.on('error', (error) => {
        clearTimeout(timeout);
        this.connecting = null;
        this.session = null;
        reject(error);
      });

      this.session.on('close', () => {
        this.session = null;
      });
    });

    return this.connecting;
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      return new Promise((resolve) => {
        this.session!.close(() => {
          this.session = null;
          resolve();
        });
      });
    }
  }

  async send(
    deviceToken: string,
    notification: APNSNotification
  ): Promise<APNSResponse> {
    await this.connect();

    if (!this.session) {
      throw new Error('Not connected');
    }

    const token = this.jwtManager.getToken();
    const path = `/3/device/${deviceToken}`;

    const headers: http2.OutgoingHttpHeaders = {
      ':method': 'POST',
      ':path': path,
      'authorization': `bearer ${token}`,
      'apns-topic': notification.topic || this.bundleId,
      'apns-push-type': notification.pushType || 'alert',
    };

    if (notification.expiration !== undefined) {
      headers['apns-expiration'] = notification.expiration.toString();
    }

    if (notification.priority !== undefined) {
      headers['apns-priority'] = notification.priority.toString();
    }

    if (notification.collapseId) {
      headers['apns-collapse-id'] = notification.collapseId;
    }

    if (notification.apnsId) {
      headers['apns-id'] = notification.apnsId;
    }

    return new Promise((resolve, reject) => {
      const req = this.session!.request(headers);
      let responseHeaders: http2.IncomingHttpHeaders;
      let responseData = '';

      req.on('response', (headers) => {
        responseHeaders = headers;
      });

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        const status = Number(responseHeaders[':status']) || 0;
        const apnsIdHeader = responseHeaders['apns-id'];
        const response: APNSResponse = {
          status,
          apnsId: Array.isArray(apnsIdHeader) ? apnsIdHeader[0] : apnsIdHeader,
        };

        if (status !== 200 && responseData) {
          try {
            const body = JSON.parse(responseData);
            response.reason = body.reason;
            response.timestamp = body.timestamp;
          } catch {
            // Ignore parse errors
          }
        }

        resolve(response);
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(JSON.stringify(notification.payload));
      req.end();
    });
  }

  async sendBatch(
    notifications: Array<{ deviceToken: string; notification: APNSNotification }>
  ): Promise<Array<{ deviceToken: string; response: APNSResponse }>> {
    const results = await Promise.all(
      notifications.map(async ({ deviceToken, notification }) => {
        try {
          const response = await this.send(deviceToken, notification);
          return { deviceToken, response };
        } catch (error) {
          return {
            deviceToken,
            response: {
              status: 500,
              reason: error instanceof Error ? error.message : 'Unknown error',
            },
          };
        }
      })
    );

    return results;
  }
}
