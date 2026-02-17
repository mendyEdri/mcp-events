/**
 * Webhook Processors
 *
 * Handle incoming webhooks from various sources (GitHub, Slack, Linear, etc.)
 * and transform them into MCPE events.
 */

import { createEvent, type MCPEvent } from '@mcpe/core';
import { createHmac, timingSafeEqual } from 'crypto';

// Environment variables
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

/**
 * Result of processing a webhook
 */
export interface WebhookResult {
  success: boolean;
  event?: MCPEvent;
  error?: string;
  eventType?: string;
}

/**
 * GitHub Pull Request payload (subset of fields we care about)
 */
interface GitHubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user: {
      login: string;
      avatar_url: string;
    };
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
    };
    additions?: number;
    deletions?: number;
    changed_files?: number;
    commits?: number;
    mergeable?: boolean;
    draft?: boolean;
  };
  repository: {
    full_name: string;
    html_url: string;
  };
  sender: {
    login: string;
  };
}

/**
 * GitHub Push payload
 */
interface GitHubPushPayload {
  ref: string;
  before: string;
  after: string;
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
  repository: {
    full_name: string;
    html_url: string;
  };
  pusher: {
    name: string;
    email: string;
  };
}

/**
 * Generic GitHub payload type
 */
type GitHubPayload = GitHubPullRequestPayload | GitHubPushPayload | Record<string, unknown>;

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) {
    // If no secret is configured, skip verification (for development)
    if (!secret) {
      console.warn('[Webhook] No GITHUB_WEBHOOK_SECRET configured, skipping signature verification');
      return true;
    }
    return false;
  }

  // GitHub sends signature as "sha256=<hash>"
  const signatureParts = signature.split('=');
  if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
    return false;
  }

  const expectedSignature = signatureParts[1];
  const computedSignature = createHmac('sha256', secret).update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Transform a GitHub pull_request event to an MCPEvent
 */
function transformPullRequestPayload(payload: GitHubPullRequestPayload): MCPEvent {
  const pr = payload.pull_request;
  const eventType = `github.pull_request.${payload.action}`;

  return createEvent(
    eventType,
    {
      action: payload.action,
      number: pr.number,
      title: pr.title,
      body: pr.body || '',
      url: pr.html_url,
      author: {
        login: pr.user.login,
        avatarUrl: pr.user.avatar_url,
      },
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
      },
      base: {
        ref: pr.base.ref,
      },
      repository: {
        fullName: payload.repository.full_name,
        url: payload.repository.html_url,
      },
      stats: {
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        changedFiles: pr.changed_files || 0,
        commits: pr.commits || 0,
      },
      isDraft: pr.draft || false,
      isMergeable: pr.mergeable,
    },
    {
      priority: 'normal',
      tags: ['pull-request', payload.action, payload.repository.full_name],
    }
  );
}

/**
 * Transform a GitHub push event to an MCPEvent
 */
function transformPushPayload(payload: GitHubPushPayload): MCPEvent {
  const branch = payload.ref.replace('refs/heads/', '');

  return createEvent(
    'github.push',
    {
      ref: payload.ref,
      branch,
      before: payload.before,
      after: payload.after,
      commits: payload.commits.map((c) => ({
        id: c.id,
        message: c.message,
        author: c.author,
        added: c.added,
        removed: c.removed,
        modified: c.modified,
      })),
      repository: {
        fullName: payload.repository.full_name,
        url: payload.repository.html_url,
      },
      pusher: payload.pusher,
    },
    {
      priority: 'normal',
      tags: ['push', branch, payload.repository.full_name],
    }
  );
}

/**
 * Transform a GitHub payload to an MCPEvent based on event type
 */
export function transformGitHubPayload(eventType: string, payload: GitHubPayload): MCPEvent {
  switch (eventType) {
    case 'pull_request':
      return transformPullRequestPayload(payload as GitHubPullRequestPayload);

    case 'push':
      return transformPushPayload(payload as GitHubPushPayload);

    case 'issues':
      return createEvent(
        `github.issue.${(payload as { action?: string }).action || 'unknown'}`,
        payload as Record<string, unknown>,
        { priority: 'normal', tags: ['issue'] }
      );

    case 'issue_comment':
      return createEvent(
        `github.issue_comment.${(payload as { action?: string }).action || 'created'}`,
        payload as Record<string, unknown>,
        { priority: 'normal', tags: ['comment'] }
      );

    case 'pull_request_review':
      return createEvent(
        `github.pull_request_review.${(payload as { action?: string }).action || 'submitted'}`,
        payload as Record<string, unknown>,
        { priority: 'normal', tags: ['review'] }
      );

    case 'pull_request_review_comment':
      return createEvent(
        `github.pull_request_review_comment.${(payload as { action?: string }).action || 'created'}`,
        payload as Record<string, unknown>,
        { priority: 'normal', tags: ['review-comment'] }
      );

    default:
      // Generic transformation for unknown event types
      return createEvent(`github.${eventType}`, payload as Record<string, unknown>, {
        priority: 'normal',
        tags: [eventType],
      });
  }
}

/**
 * Process an incoming GitHub webhook
 */
export function processGitHubWebhook(
  rawBody: string,
  eventType: string | undefined,
  signature: string | undefined
): WebhookResult {
  // Verify signature
  if (!verifyGitHubSignature(rawBody, signature, GITHUB_WEBHOOK_SECRET)) {
    return {
      success: false,
      error: 'Invalid webhook signature',
    };
  }

  // Parse payload
  let payload: GitHubPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return {
      success: false,
      error: 'Invalid JSON payload',
    };
  }

  // Must have an event type
  if (!eventType) {
    return {
      success: false,
      error: 'Missing X-GitHub-Event header',
    };
  }

  // Skip ping events (used for webhook verification)
  if (eventType === 'ping') {
    return {
      success: true,
      eventType: 'ping',
    };
  }

  // Transform to MCPEvent
  const event = transformGitHubPayload(eventType, payload);

  return {
    success: true,
    event,
    eventType: event.type,
  };
}

/**
 * Process a generic webhook (for Slack, Linear, custom sources)
 */
export function processGenericWebhook(
  body: Record<string, unknown>,
  source: string = 'custom',
  eventType?: string
): WebhookResult {
  // Determine event type from body or parameter
  const type = eventType || (body.type as string) || (body.event as string) || 'generic.event';

  const event = createEvent(
    type.includes('.') ? type : `${source}.${type}`,
    body,
    {
      priority: 'normal',
      tags: [source],
    }
  );

  return {
    success: true,
    event,
    eventType: event.type,
  };
}

/**
 * Google Pub/Sub push notification payload
 */
interface GooglePubSubPayload {
  message: {
    data: string; // Base64 encoded
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

/**
 * Gmail push notification data (decoded from Pub/Sub)
 */
interface GmailPushNotification {
  emailAddress: string;
  historyId: number;
}

/**
 * Process a Google Cloud Pub/Sub webhook (for Gmail, Calendar, Drive)
 */
export function processGoogleWebhook(
  body: GooglePubSubPayload | Record<string, unknown>,
  service: 'gmail' | 'calendar' | 'drive' = 'gmail'
): WebhookResult {
  // Check if it's a Pub/Sub message
  if ('message' in body && typeof body.message === 'object' && body.message !== null) {
    const pubsubPayload = body as GooglePubSubPayload;

    try {
      // Decode base64 data
      const decodedData = Buffer.from(pubsubPayload.message.data, 'base64').toString('utf-8');
      let notificationData: GmailPushNotification | Record<string, unknown>;

      try {
        notificationData = JSON.parse(decodedData);
      } catch {
        // If not JSON, treat as plain text
        notificationData = { rawData: decodedData };
      }

      // Determine event type based on service
      let eventType: string;
      if (service === 'gmail') {
        // Gmail notifications indicate history changes - new messages, label changes, etc.
        eventType = 'gmail.message.received';
      } else if (service === 'calendar') {
        eventType = 'calendar.event.updated';
      } else {
        eventType = 'drive.file.updated';
      }

      const event = createEvent(
        eventType,
        {
          ...notificationData,
          messageId: pubsubPayload.message.messageId,
          publishTime: pubsubPayload.message.publishTime,
          subscription: pubsubPayload.subscription,
          attributes: pubsubPayload.message.attributes,
        },
        {
          priority: 'normal',
          tags: [service, 'push-notification'],
        }
      );

      return {
        success: true,
        event,
        eventType: event.type,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to decode Pub/Sub message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Handle direct webhook payload (not Pub/Sub)
  const directBody = body as Record<string, unknown>;
  const eventType = (directBody.eventType as string) || (directBody.type as string) || `${service}.event`;

  const event = createEvent(
    eventType.includes('.') ? eventType : `${service}.${eventType}`,
    directBody,
    {
      priority: 'normal',
      tags: [service],
    }
  );

  return {
    success: true,
    event,
    eventType: event.type,
  };
}
