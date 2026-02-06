/**
 * MCPE Example Integrations
 *
 * Defines example integrations with setup instructions for the Examples tab.
 * Includes both manual setup examples and interactive integrations that can be enabled directly.
 */

import { connectPolymarket, disconnectPolymarket } from './polymarket-integration.js';

export interface SetupStep {
  title: string;
  description: string;
  code?: string;
  language?: string;
}

export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'oauth';
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  description?: string;
  oauthProvider?: 'github' | 'google';
}

export interface MCPEExample {
  id: string;
  name: string;
  description: string;
  source: 'github' | 'slack' | 'linear' | 'gmail' | 'google' | 'polymarket' | 'custom';
  icon: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  webhookEndpoint?: string;
  eventTypes: string[];
  setupSteps: SetupStep[];
  // New: Interactive integration support
  interactive?: boolean;
  configFields?: ConfigField[];
  availableSubscriptions?: {
    id: string;
    name: string;
    description: string;
    eventTypes: string[];
    defaultEnabled?: boolean;
  }[];
  // External service URL (for services like Polymarket that run separately)
  externalServiceUrl?: string;
}

// In-memory storage for enabled integrations
interface EnabledIntegration {
  id: string;
  enabled: boolean;
  config: Record<string, string>;
  enabledSubscriptions: string[];
  enabledAt?: string;
}

const enabledIntegrations: Map<string, EnabledIntegration> = new Map();

export const MCPE_EXAMPLES: MCPEExample[] = [
  // ============ Interactive Integrations (MCPE + MCP) ============
  {
    id: 'mcpe-github',
    name: 'MCPE + GitHub',
    description:
      'Full GitHub integration powered by MCPE events and MCP tools. Connect your GitHub account to receive real-time events (PRs, issues, pushes) and let the AI agent interact with your repositories. The agent can subscribe to specific events and take actions.',
    source: 'github',
    icon: '🐙',
    difficulty: 'beginner',
    tags: ['github', 'mcpe', 'mcp', 'interactive', 'events'],
    eventTypes: [
      'github.pull_request.*',
      'github.push',
      'github.issues.*',
      'github.issue_comment.*',
      'github.pull_request_review.*',
    ],
    interactive: true,
    configFields: [
      {
        name: 'githubToken',
        label: 'GitHub Account',
        type: 'oauth',
        required: true,
        oauthProvider: 'github',
        description: 'Connect your GitHub account',
      },
      {
        name: 'defaultRepo',
        label: 'Default Repository (optional)',
        type: 'text',
        placeholder: 'owner/repo',
        required: false,
        description: 'Default repository for the agent to work with',
      },
    ],
    availableSubscriptions: [
      {
        id: 'github-pr-opened',
        name: 'PR Opened',
        description: 'Get notified when pull requests are opened',
        eventTypes: ['github.pull_request.opened'],
        defaultEnabled: true,
      },
      {
        id: 'github-pr-review',
        name: 'PR Reviews',
        description: 'Get notified when PRs receive reviews',
        eventTypes: ['github.pull_request_review.submitted'],
        defaultEnabled: false,
      },
      {
        id: 'github-push',
        name: 'Push Events',
        description: 'Get notified on pushes to repositories',
        eventTypes: ['github.push'],
        defaultEnabled: false,
      },
      {
        id: 'github-issues',
        name: 'Issue Events',
        description: 'Get notified when issues are created or updated',
        eventTypes: ['github.issues.opened', 'github.issues.closed'],
        defaultEnabled: false,
      },
      {
        id: 'github-comments',
        name: 'Comments',
        description: 'Get notified on issue and PR comments',
        eventTypes: ['github.issue_comment.created'],
        defaultEnabled: false,
      },
    ],
    setupSteps: [
      {
        title: '1. Enter Your GitHub Token',
        description:
          'Provide a GitHub Personal Access Token with repo scope. This allows the agent to read repository data and receive events.',
      },
      {
        title: '2. Select Event Subscriptions',
        description:
          'Choose which GitHub events you want to subscribe to. The AI agent will be notified when these events occur.',
      },
      {
        title: '3. Configure Webhook (for real-time events)',
        description:
          'To receive real-time events, add a webhook to your repository pointing to this server.',
        code: `Webhook URL: https://mcpe-agent-server.fly.dev/webhook/github
Content type: application/json
Events: Select the events you subscribed to above`,
        language: 'text',
      },
    ],
  },

  // Google Workspace Integration
  {
    id: 'mcpe-google-workspace',
    name: 'MCPE + Google Workspace',
    description:
      'Full Google Workspace integration powered by MCPE events and MCP tools. Connect your Google account to receive real-time events from Gmail, Calendar, and Drive. The AI agent can read emails, manage calendar events, and interact with your Google Workspace.',
    source: 'google',
    icon: '📧',
    difficulty: 'beginner',
    tags: ['google', 'gmail', 'calendar', 'drive', 'mcpe', 'mcp', 'interactive', 'events'],
    eventTypes: [
      'gmail.message.received',
      'gmail.message.sent',
      'gmail.label.added',
      'calendar.event.created',
      'calendar.event.updated',
      'calendar.event.reminder',
      'drive.file.created',
      'drive.file.shared',
    ],
    interactive: true,
    configFields: [
      {
        name: 'googleToken',
        label: 'Google Account',
        type: 'oauth',
        required: true,
        oauthProvider: 'google',
        description: 'Connect your Google account to enable Gmail, Calendar, and Drive access',
      },
      {
        name: 'defaultLabel',
        label: 'Default Gmail Label (optional)',
        type: 'text',
        placeholder: 'INBOX',
        required: false,
        description: 'Default label to watch for new emails',
      },
    ],
    availableSubscriptions: [
      {
        id: 'gmail-new-email',
        name: 'New Emails',
        description: 'Get notified when new emails arrive in your inbox',
        eventTypes: ['gmail.message.received'],
        defaultEnabled: true,
      },
      {
        id: 'gmail-important',
        name: 'Important Emails',
        description: 'Get notified for emails marked as important',
        eventTypes: ['gmail.message.important'],
        defaultEnabled: false,
      },
      {
        id: 'gmail-mentions',
        name: 'Email Mentions',
        description: 'Get notified when you are mentioned in an email thread',
        eventTypes: ['gmail.message.mention'],
        defaultEnabled: false,
      },
      {
        id: 'calendar-events',
        name: 'Calendar Events',
        description: 'Get notified about calendar event changes',
        eventTypes: ['calendar.event.created', 'calendar.event.updated'],
        defaultEnabled: false,
      },
      {
        id: 'calendar-reminders',
        name: 'Calendar Reminders',
        description: 'Get reminders before upcoming calendar events',
        eventTypes: ['calendar.event.reminder'],
        defaultEnabled: false,
      },
      {
        id: 'drive-shares',
        name: 'Drive Shares',
        description: 'Get notified when files are shared with you',
        eventTypes: ['drive.file.shared'],
        defaultEnabled: false,
      },
    ],
    setupSteps: [
      {
        title: '1. Connect Your Google Account',
        description:
          'Click "Connect with Google" to authorize access to Gmail, Calendar, and Drive. The agent will only access data you explicitly allow.',
      },
      {
        title: '2. Select Event Subscriptions',
        description:
          'Choose which Google Workspace events you want to subscribe to. The AI agent will be notified when these events occur and can take actions on your behalf.',
      },
      {
        title: '3. Configure Push Notifications (Advanced)',
        description:
          'For real-time Gmail notifications, you can set up Google Cloud Pub/Sub push notifications.',
        code: `# Google Cloud Pub/Sub Setup (optional)
# 1. Create a Pub/Sub topic in Google Cloud Console
# 2. Grant Gmail publish permissions to the topic
# 3. Configure push endpoint:
Push Endpoint: https://mcpe-agent-server.fly.dev/webhook/google
Topic: projects/YOUR_PROJECT/topics/gmail-events`,
        language: 'bash',
      },
    ],
  },

  // Polymarket Prediction Markets Integration
  {
    id: 'mcpe-polymarket',
    name: 'MCPE + Polymarket',
    description:
      'Real-time prediction market events from Polymarket. Get notified when market odds shift significantly on topics you care about (AI, elections, crypto, etc.). The AI agent can analyze why prices moved and correlate with news.',
    source: 'polymarket',
    icon: '🔮',
    difficulty: 'beginner',
    tags: ['polymarket', 'prediction-markets', 'crypto', 'trading', 'mcpe', 'events'],
    eventTypes: [
      'polymarket.price.up',
      'polymarket.price.down',
      'polymarket.market.created',
      'polymarket.market.resolved',
    ],
    interactive: true,
    externalServiceUrl: 'https://polymarket-mcpe-server.fly.dev',
    configFields: [
      {
        name: 'topics',
        label: 'Topics to Watch',
        type: 'text',
        placeholder: 'AI, Trump, Bitcoin, election',
        required: false,
        description: 'Comma-separated keywords to filter markets (leave empty for all)',
      },
      {
        name: 'threshold',
        label: 'Price Change Threshold (%)',
        type: 'text',
        placeholder: '5',
        required: false,
        description: 'Minimum % price change to trigger an event (default: 5%)',
      },
    ],
    availableSubscriptions: [
      {
        id: 'polymarket-price-alerts',
        name: 'Price Alerts',
        description: 'Get notified when market odds shift above your threshold',
        eventTypes: ['polymarket.price.up', 'polymarket.price.down'],
        defaultEnabled: true,
      },
      {
        id: 'polymarket-ai-markets',
        name: 'AI Markets',
        description: 'Track prediction markets related to AI (GPT-5, AGI, etc.)',
        eventTypes: ['polymarket.price.*'],
        defaultEnabled: false,
      },
      {
        id: 'polymarket-politics',
        name: 'Politics Markets',
        description: 'Track election and political prediction markets',
        eventTypes: ['polymarket.price.*'],
        defaultEnabled: false,
      },
      {
        id: 'polymarket-crypto',
        name: 'Crypto Markets',
        description: 'Track cryptocurrency-related prediction markets',
        eventTypes: ['polymarket.price.*'],
        defaultEnabled: false,
      },
    ],
    setupSteps: [
      {
        title: '1. Configure Topics',
        description:
          'Choose which topics to monitor (AI, Trump, Bitcoin, etc.). The Polymarket server is already running and will filter markets based on your topics.',
      },
      {
        title: '2. Set Threshold',
        description:
          'Set the minimum price change threshold to trigger events. Default is 5% - only significant market moves will be reported.',
      },
      {
        title: '3. Enable Subscriptions',
        description:
          'Select which event types you want to receive. Price alerts are enabled by default.',
      },
      {
        title: '4. AI Agent Use Cases',
        description:
          'Once enabled, the AI agent will receive real-time price movements and can:',
        code: `Example events:
- "Will GPT-5 be released in 2025?" - Yes 📈 45% → 62% (+17%)
- "Trump wins 2024 election" - Yes 📉 52% → 48% (-8%)

AI can:
- Explain why odds shifted (search recent news)
- Summarize daily market movements
- Alert on significant changes in topics you care about
- Correlate multiple market movements`,
        language: 'text',
      },
    ],
  },

];

/**
 * Get all examples
 */
export function getExamples(): MCPEExample[] {
  return MCPE_EXAMPLES;
}

/**
 * Get an example by ID
 */
export function getExampleById(id: string): MCPEExample | undefined {
  return MCPE_EXAMPLES.find((e) => e.id === id);
}

/**
 * Get integration status
 */
export function getIntegrationStatus(id: string): EnabledIntegration | undefined {
  return enabledIntegrations.get(id);
}

/**
 * Get all enabled integrations
 */
export function getAllIntegrationStatuses(): Record<string, EnabledIntegration> {
  const result: Record<string, EnabledIntegration> = {};
  enabledIntegrations.forEach((v, k) => {
    result[k] = v;
  });
  return result;
}

/**
 * Enable an integration with configuration
 */
export function enableIntegration(
  id: string,
  config: Record<string, string>,
  subscriptions: string[]
): { success: boolean; error?: string } {
  const example = getExampleById(id);
  if (!example) {
    return { success: false, error: 'Integration not found' };
  }

  if (!example.interactive) {
    return { success: false, error: 'This integration does not support interactive enablement' };
  }

  // Validate required fields
  if (example.configFields) {
    for (const field of example.configFields) {
      if (field.required && !config[field.name]) {
        return { success: false, error: `${field.label} is required` };
      }
    }
  }

  enabledIntegrations.set(id, {
    id,
    enabled: true,
    config,
    enabledSubscriptions: subscriptions,
    enabledAt: new Date().toISOString(),
  });

  console.log(`[Integration] Enabled ${id} with ${subscriptions.length} subscriptions`);

  // Special handling for Polymarket integration - auto-connect to the server
  if (id === 'mcpe-polymarket') {
    const topics = config.topics
      ? config.topics.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    const threshold = config.threshold ? parseFloat(config.threshold) / 100 : 0.05;

    // Connect asynchronously (don't block the enable call)
    connectPolymarket({
      topics,
      threshold,
      onEvent: (event) => {
        console.log(`[Polymarket Event] ${event.data.summary}`);
        // Events will be forwarded through the SSE stream to the agent
      },
    }).then((result) => {
      if (result.success) {
        console.log(`[Polymarket] Auto-connected, monitoring ${result.markets} markets`);
      } else {
        console.error(`[Polymarket] Auto-connect failed: ${result.error}`);
      }
    });
  }

  return { success: true };
}

/**
 * Disable an integration
 */
export function disableIntegration(id: string): { success: boolean } {
  enabledIntegrations.delete(id);
  console.log(`[Integration] Disabled ${id}`);

  // Special handling for Polymarket integration - disconnect from server
  if (id === 'mcpe-polymarket') {
    disconnectPolymarket().catch((err) => {
      console.error('[Polymarket] Disconnect error:', err);
    });
  }

  return { success: true };
}

/**
 * Update integration subscriptions
 */
export function updateIntegrationSubscriptions(
  id: string,
  subscriptions: string[]
): { success: boolean; error?: string } {
  const integration = enabledIntegrations.get(id);
  if (!integration) {
    return { success: false, error: 'Integration not enabled' };
  }

  integration.enabledSubscriptions = subscriptions;
  enabledIntegrations.set(id, integration);
  console.log(`[Integration] Updated ${id} subscriptions: ${subscriptions.join(', ')}`);
  return { success: true };
}

/**
 * Get GitHub token for an enabled integration
 */
export function getGitHubToken(): string | undefined {
  const github = enabledIntegrations.get('mcpe-github');
  return github?.config.githubToken || pendingOAuthTokens.get('github');
}

/**
 * Get default repo for GitHub integration
 */
export function getGitHubDefaultRepo(): string | undefined {
  const github = enabledIntegrations.get('mcpe-github');
  return github?.config.defaultRepo;
}

/**
 * Get Google token for an enabled integration
 */
export function getGoogleToken(): string | undefined {
  const google = enabledIntegrations.get('mcpe-google-workspace');
  return google?.config.googleToken || pendingOAuthTokens.get('google');
}

/**
 * Get default Gmail label for Google Workspace integration
 */
export function getGoogleDefaultLabel(): string | undefined {
  const google = enabledIntegrations.get('mcpe-google-workspace');
  return google?.config.defaultLabel;
}

// Temporary storage for OAuth tokens before integration is enabled
const pendingOAuthTokens: Map<string, string> = new Map();
const oAuthUserInfo: Map<string, { login: string; avatar_url: string; name: string }> = new Map();
const oAuthRepos: Map<string, Array<{ full_name: string; description: string; private: boolean }>> = new Map();

/**
 * Store OAuth token temporarily (before integration is fully enabled)
 */
export function setPendingOAuthToken(provider: string, token: string): void {
  pendingOAuthTokens.set(provider, token);
  console.log(`[OAuth] Stored pending ${provider} token`);
}

/**
 * Get pending OAuth token
 */
export function getPendingOAuthToken(provider: string): string | undefined {
  return pendingOAuthTokens.get(provider);
}

/**
 * Clear pending OAuth token
 */
export function clearPendingOAuthToken(provider: string): void {
  pendingOAuthTokens.delete(provider);
  oAuthUserInfo.delete(provider);
}

/**
 * Store OAuth user info
 */
export function setOAuthUserInfo(provider: string, info: { login: string; avatar_url: string; name: string }): void {
  oAuthUserInfo.set(provider, info);
}

/**
 * Get OAuth user info
 */
export function getOAuthUserInfo(provider: string): { login: string; avatar_url: string; name: string } | undefined {
  return oAuthUserInfo.get(provider);
}

/**
 * Store OAuth repos
 */
export function setOAuthRepos(provider: string, repos: Array<{ full_name: string; description: string; private: boolean }>): void {
  oAuthRepos.set(provider, repos);
}

/**
 * Get OAuth repos
 */
export function getOAuthRepos(provider: string): Array<{ full_name: string; description: string; private: boolean }> | undefined {
  return oAuthRepos.get(provider);
}

/**
 * Check if an event type matches a pattern (supports wildcards)
 */
function matchesEventType(eventType: string, pattern: string): boolean {
  if (pattern === eventType) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return eventType.startsWith(prefix + '.');
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return eventType.startsWith(prefix);
  }
  return false;
}

/**
 * Get enabled subscriptions that match an event type
 */
export function getMatchingIntegrationSubscriptions(eventType: string): Array<{
  integrationId: string;
  subscriptionId: string;
  subscriptionName: string;
  eventTypes: string[];
}> {
  const matches: Array<{
    integrationId: string;
    subscriptionId: string;
    subscriptionName: string;
    eventTypes: string[];
  }> = [];

  for (const [integrationId, integration] of enabledIntegrations) {
    if (!integration.enabled) continue;

    const example = getExampleById(integrationId);
    if (!example?.availableSubscriptions) continue;

    for (const subId of integration.enabledSubscriptions) {
      const sub = example.availableSubscriptions.find(s => s.id === subId);
      if (!sub) continue;

      // Check if any of this subscription's event types match
      for (const pattern of sub.eventTypes) {
        if (matchesEventType(eventType, pattern)) {
          matches.push({
            integrationId,
            subscriptionId: subId,
            subscriptionName: sub.name,
            eventTypes: sub.eventTypes,
          });
          break; // Don't add the same subscription twice
        }
      }
    }
  }

  return matches;
}
