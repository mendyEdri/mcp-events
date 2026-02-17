import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export const EventPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export type EventPriority = z.infer<typeof EventPrioritySchema>;

export const EventMetadataSchema = z.object({
  sourceEventId: z.string().optional(),
  timestamp: z.string().datetime(),
  priority: EventPrioritySchema.default('normal'),
  tags: z.array(z.string()).optional(),
});

export type EventMetadata = z.infer<typeof EventMetadataSchema>;

export const ESMCPEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  data: z.record(z.unknown()),
  metadata: EventMetadataSchema,
});

export type ESMCPEvent = z.infer<typeof ESMCPEventSchema>;

export const EventFilterSchema = z.object({
  eventTypes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  priority: z.array(EventPrioritySchema).optional(),
});

export type EventFilter = z.infer<typeof EventFilterSchema>;

export function matchesFilter(event: ESMCPEvent, filter: EventFilter): boolean {
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

  if (filter.tags && filter.tags.length > 0) {
    const eventTags = event.metadata.tags || [];
    const hasMatchingTag = filter.tags.some((tag) => eventTags.includes(tag));
    if (!hasMatchingTag) {
      return false;
    }
  }

  if (filter.priority && filter.priority.length > 0) {
    if (!filter.priority.includes(event.metadata.priority)) {
      return false;
    }
  }

  return true;
}

export function createEvent(
  type: string,
  data: Record<string, unknown>,
  metadata: Omit<EventMetadata, 'timestamp'> & { timestamp?: string }
): ESMCPEvent {
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
