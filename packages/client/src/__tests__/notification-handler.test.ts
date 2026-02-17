import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationHandler } from '../handlers/notification.js';
import type { ESMCPEvent } from '@esmcp/core';

describe('NotificationHandler', () => {
  let handler: NotificationHandler;

  const createEvent = (type: string): ESMCPEvent => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    type,
    data: {},
    metadata: {
      timestamp: new Date().toISOString(),
      priority: 'normal',
    },
  });

  beforeEach(() => {
    handler = new NotificationHandler();
  });

  it('should call handler for exact match', () => {
    const callback = vi.fn();
    handler.onEvent('github.push', callback);

    const event = createEvent('github.push');
    handler.handleEvent(event, 'sub-1');

    expect(callback).toHaveBeenCalledWith(event, 'sub-1');
  });

  it('should call handler for wildcard match', () => {
    const callback = vi.fn();
    handler.onEvent('github.*', callback);

    const event = createEvent('github.push');
    handler.handleEvent(event, 'sub-1');

    expect(callback).toHaveBeenCalledWith(event, 'sub-1');
  });

  it('should call global handler for all events', () => {
    const callback = vi.fn();
    handler.onEvent('*', callback);

    handler.handleEvent(createEvent('github.push'), 'sub-1');
    handler.handleEvent(createEvent('gmail.message'), 'sub-2');

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should not call handler for non-matching pattern', () => {
    const callback = vi.fn();
    handler.onEvent('gmail.*', callback);

    handler.handleEvent(createEvent('github.push'), 'sub-1');

    expect(callback).not.toHaveBeenCalled();
  });

  it('should unsubscribe handler', () => {
    const callback = vi.fn();
    const unsubscribe = handler.onEvent('github.push', callback);

    unsubscribe();

    handler.handleEvent(createEvent('github.push'), 'sub-1');

    expect(callback).not.toHaveBeenCalled();
  });

  it('should match deep wildcard patterns', () => {
    const callback = vi.fn();
    handler.onEvent('github.**', callback);

    handler.handleEvent(createEvent('github.repo.push'), 'sub-1');
    handler.handleEvent(createEvent('github.issues.opened'), 'sub-2');

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should match pattern with wildcard in middle', () => {
    const callback = vi.fn();
    handler.onEvent('github.*.push', callback);

    handler.handleEvent(createEvent('github.repo.push'), 'sub-1');
    handler.handleEvent(createEvent('github.org.push'), 'sub-2');
    handler.handleEvent(createEvent('github.repo.pull'), 'sub-3');

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should handle errors in handlers gracefully', () => {
    const errorCallback = vi.fn(() => {
      throw new Error('Handler error');
    });
    const normalCallback = vi.fn();

    handler.onEvent('*', errorCallback);
    handler.onEvent('*', normalCallback);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handler.handleEvent(createEvent('github.push'), 'sub-1');

    expect(normalCallback).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should clear all handlers', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    handler.onEvent('github.*', callback1);
    handler.onEvent('*', callback2);

    handler.clear();

    handler.handleEvent(createEvent('github.push'), 'sub-1');

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });
});
