import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

/**
 * Event source - identifies where events originate
 */
export const EventSourceSchema = z.enum([
  'github',
  'gmail',
  'slack',
  'custom',
]);

export type EventSource = z.infer<typeof EventSourceSchema>;

/**
 * Event priority levels
 */
export const EventPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export type EventPriority = z.infer<typeof EventPrioritySchema>;

/**
 * Event metadata - standardized metadata attached to every event
 */
export const EventMetadataSchema = z.object({
  source: EventSourceSchema,
  sourceEventId: z.string().optional(),
  timestamp: z.string().datetime(),
  priority: EventPrioritySchema.default('normal'),
  tags: z.array(z.string()).optional(),
});

export type EventMetadata = z.infer<typeof EventMetadataSchema>;

/**
 * MCPE Event - the core event type
 */
export const MCPEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  data: z.record(z.unknown()),
  metadata: EventMetadataSchema,
});

export type MCPEvent = z.infer<typeof MCPEventSchema>;

/**
 * Event filter for subscriptions - defines which events to receive
 */
export const EventFilterSchema = z.object({
  sources: z.array(EventSourceSchema).optional(),
  eventTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  priority: z.array(EventPrioritySchema).optional(),
});

export type EventFilter = z.infer<typeof EventFilterSchema>;

/**
 * Check if an event matches a filter
 *
 * Matching rules:
 * - Empty filter matches all events
 * - sources: event source must be in the list
 * - eventTypes: supports exact match or wildcard (e.g., "github.*")
 * - tags: event must have at least one matching tag (OR)
 * - priority: event priority must be in the list
 */
export function matchesFilter(event: MCPEvent, filter: EventFilter): boolean {
  // Source filter
  if (filter.sources && filter.sources.length > 0) {
    if (!filter.sources.includes(event.metadata.source)) {
      return false;
    }
  }

  // Event type filter (supports wildcards)
  if (filter.eventTypes && filter.eventTypes.length > 0) {
    const matches = filter.eventTypes.some((pattern) => {
      if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        return event.type.startsWith(prefix + '.');
      }
      return event.type === pattern;
    });
    if (!matches) {
      return false;
    }
  }

  // Tags filter (OR - matches if any tag matches)
  if (filter.tags && filter.tags.length > 0) {
    const eventTags = event.metadata.tags || [];
    const hasMatchingTag = filter.tags.some((tag) => eventTags.includes(tag));
    if (!hasMatchingTag) {
      return false;
    }
  }

  // Priority filter
  if (filter.priority && filter.priority.length > 0) {
    if (!filter.priority.includes(event.metadata.priority)) {
      return false;
    }
  }

  return true;
}

/**
 * Create a new event with auto-generated ID and timestamp
 */
export function createEvent(
  type: string,
  data: Record<string, unknown>,
  metadata: Omit<EventMetadata, 'timestamp'> & { timestamp?: string }
): MCPEvent {
  return {
    id: uuidv4(),
    type,
    data,
    metadata: {
      ...metadata,
      timestamp: metadata.timestamp || new Date().toISOString(),
    },
  };
}
