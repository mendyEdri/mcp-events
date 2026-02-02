import type { ESMCPEvent } from '@esmcp/core';

export type EventHandler = (event: ESMCPEvent, subscriptionId: string) => void;

export class NotificationHandler {
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private globalHandlers: Set<EventHandler> = new Set();

  onEvent(pattern: string, handler: EventHandler): () => void {
    if (pattern === '*') {
      this.globalHandlers.add(handler);
      return () => {
        this.globalHandlers.delete(handler);
      };
    }

    if (!this.handlers.has(pattern)) {
      this.handlers.set(pattern, new Set());
    }
    this.handlers.get(pattern)!.add(handler);

    return () => {
      const handlers = this.handlers.get(pattern);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.handlers.delete(pattern);
        }
      }
    };
  }

  handleEvent(event: ESMCPEvent, subscriptionId: string): void {
    // Call global handlers
    this.globalHandlers.forEach((handler) => {
      try {
        handler(event, subscriptionId);
      } catch (error) {
        console.error('Error in global event handler:', error);
      }
    });

    // Match against patterns
    this.handlers.forEach((handlers, pattern) => {
      if (this.matchPattern(event.type, pattern)) {
        handlers.forEach((handler) => {
          try {
            handler(event, subscriptionId);
          } catch (error) {
            console.error('Error in event handler:', error);
          }
        });
      }
    });
  }

  private matchPattern(eventType: string, pattern: string): boolean {
    if (pattern === eventType) {
      return true;
    }

    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix + '.');
    }

    if (pattern.endsWith('.**')) {
      const prefix = pattern.slice(0, -3);
      return eventType.startsWith(prefix + '.') || eventType === prefix;
    }

    // Support wildcards in the middle: "github.*.push"
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^.]*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventType);
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers.clear();
  }
}
