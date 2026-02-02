import { describe, it, expect } from 'vitest';
import {
  ESMCPEventSchema,
  matchesFilter,
  createEvent,
  type ESMCPEvent,
  type EventFilter,
} from '../types/events.js';

describe('Events', () => {
  describe('ESMCPEventSchema', () => {
    it('should validate a valid event', () => {
      const event = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'github.push',
        data: { repository: 'test/repo' },
        metadata: {
          source: 'github',
          timestamp: '2024-01-01T00:00:00.000Z',
          priority: 'normal',
        },
      };

      const result = ESMCPEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('should reject an event with invalid source', () => {
      const event = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        type: 'test.event',
        data: {},
        metadata: {
          source: 'invalid-source',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      };

      const result = ESMCPEventSchema.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('matchesFilter', () => {
    const baseEvent: ESMCPEvent = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'github.push',
      data: {},
      metadata: {
        source: 'github',
        timestamp: '2024-01-01T00:00:00.000Z',
        priority: 'normal',
        tags: ['important', 'ci'],
      },
    };

    it('should match when filter is empty', () => {
      const filter: EventFilter = {};
      expect(matchesFilter(baseEvent, filter)).toBe(true);
    });

    it('should match by source', () => {
      const filter: EventFilter = { sources: ['github'] };
      expect(matchesFilter(baseEvent, filter)).toBe(true);
    });

    it('should not match when source differs', () => {
      const filter: EventFilter = { sources: ['gmail'] };
      expect(matchesFilter(baseEvent, filter)).toBe(false);
    });

    it('should match exact event type', () => {
      const filter: EventFilter = { eventTypes: ['github.push'] };
      expect(matchesFilter(baseEvent, filter)).toBe(true);
    });

    it('should match wildcard event type', () => {
      const filter: EventFilter = { eventTypes: ['github.*'] };
      expect(matchesFilter(baseEvent, filter)).toBe(true);
    });

    it('should not match non-matching wildcard', () => {
      const filter: EventFilter = { eventTypes: ['gmail.*'] };
      expect(matchesFilter(baseEvent, filter)).toBe(false);
    });

    it('should match by tag', () => {
      const filter: EventFilter = { tags: ['important'] };
      expect(matchesFilter(baseEvent, filter)).toBe(true);
    });

    it('should not match when tag is missing', () => {
      const filter: EventFilter = { tags: ['urgent'] };
      expect(matchesFilter(baseEvent, filter)).toBe(false);
    });

    it('should match by priority', () => {
      const filter: EventFilter = { priority: ['normal', 'high'] };
      expect(matchesFilter(baseEvent, filter)).toBe(true);
    });

    it('should handle multiple filter criteria (AND logic)', () => {
      const filter: EventFilter = {
        sources: ['github'],
        eventTypes: ['github.*'],
        tags: ['ci'],
      };
      expect(matchesFilter(baseEvent, filter)).toBe(true);
    });

    it('should fail when any filter criterion fails', () => {
      const filter: EventFilter = {
        sources: ['github'],
        eventTypes: ['gmail.*'], // This will fail
      };
      expect(matchesFilter(baseEvent, filter)).toBe(false);
    });
  });

  describe('createEvent', () => {
    it('should create an event with generated ID and timestamp', () => {
      const event = createEvent(
        'test.event',
        { foo: 'bar' },
        { source: 'github', priority: 'high' }
      );

      expect(event.id).toBeDefined();
      expect(event.type).toBe('test.event');
      expect(event.data).toEqual({ foo: 'bar' });
      expect(event.metadata.source).toBe('github');
      expect(event.metadata.priority).toBe('high');
      expect(event.metadata.timestamp).toBeDefined();
    });
  });
});
