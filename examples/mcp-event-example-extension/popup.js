// Helper to safely get elements
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// DOM Elements - Chat
const tabBtns = $$('.tab-btn');
const chatMessages = $('chat-messages');
const chatInput = $('chat-input');
const sendBtn = $('send-btn');

// DOM Elements - MCP
const mcpNotificationsList = $('mcp-notifications-list');
const refreshMcpNotificationsBtn = $('refresh-mcp-notifications-btn');
const clearMcpNotificationsBtn = $('clear-mcp-notifications-btn');
const testNotifTitle = $('test-notif-title');
const testNotifBody = $('test-notif-body');
const sendTestNotificationBtn = $('send-test-notification-btn');
const mcpResult = $('mcp-result');
const mcpResultContent = $('mcp-result-content');

// DOM Elements - Settings
const baseUrlInput = $('base-url');
const apiKeyInput = $('api-key');
const modelInput = $('model-input');
const mcpeServerUrlInput = $('mcpe-server-url');
const vapidPublicKeyInput = $('vapid-public-key');
const notificationsToggle = $('notifications-toggle');
const clearHistoryBtn = $('clear-history-btn');
const exportConfigBtn = $('export-config-btn');
const importConfigBtn = $('import-config-btn');
const importFileInput = $('import-file-input');
const settingsStatus = $('settings-status');

// DOM Elements - Events
const sseStatusText = $('sse-status-text');
const sseIndicator = $('sse-indicator');
const testConnectionBtn = $('test-connection-btn');
const connectSseBtn = $('connect-sse-btn');
const disconnectSseBtn = $('disconnect-sse-btn');
const pushStatusText = $('push-status-text');
const pushStatusIndicator = document.querySelector('#push-status .status-indicator');
const subscribePushBtn = $('subscribe-push-btn');
const unsubscribePushBtn = $('unsubscribe-push-btn');
const subscriptionsList = $('subscriptions-list');
const addSubscriptionBtn = $('add-subscription-btn');
const refreshSubscriptionsBtn = $('refresh-subscriptions-btn');
const eventsList = $('events-list');
const clearEventsBtn = $('clear-events-btn');

// DOM Elements - Modal
const subscriptionModal = $('subscription-modal');
const subNameInput = $('sub-name');
const subEventTypesInput = $('sub-event-types');
const subSourcesInput = $('sub-sources');
const subHandlerSelect = $('sub-handler');
const saveSubscriptionBtn = $('save-subscription-btn');
const cancelSubscriptionBtn = $('cancel-subscription-btn');

// DOM Elements - Approved Sites
const approvedSitesList = $('approved-sites-list');
const newSiteInput = $('new-site-input');
const addSiteBtn = $('add-site-btn');
const approveCurrentSiteBtn = $('approve-current-site-btn');

// State
let chatHistory = [];
let isLoading = false;
let pushSubscription = null;
let mcpeSubscriptions = [];
let recentEvents = [];
let mcpeClient = null;
let approvedSites = [];

// Initialize tabs immediately (before DOMContentLoaded for faster response)
document.addEventListener('DOMContentLoaded', () => {
  // Set up tab switching first - this should always work
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const tabName = this.dataset.tab;
      console.log('[Popup] Switching to tab:', tabName);

      // Update button states
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
      });

      // Update tab content visibility
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
      });
    });
  });

  // Then initialize the rest
  init();
});

async function init() {
  try {
    console.log('[Popup] Initializing...');
    setupEventListeners();
    console.log('[Popup] Event listeners set up');

    await loadSettings();
    await loadChatHistory();
    await loadMcpeSubscriptions().catch(e => console.warn('loadMcpeSubscriptions:', e));
    await loadRecentEvents().catch(e => console.warn('loadRecentEvents:', e));
    await checkPushSubscription().catch(e => console.warn('checkPushSubscription:', e));
    await loadMCPNotifications().catch(e => console.warn('loadMCPNotifications:', e));
    await loadApprovedSites().catch(e => console.warn('loadApprovedSites:', e));

    console.log('[Popup] Initialization complete');
  } catch (error) {
    console.error('[Popup] Initialization error:', error);
  }
}

// Event Listeners
function setupEventListeners() {
  // Tab switching is handled in DOMContentLoaded above

  // Chat
  sendBtn?.addEventListener('click', sendMessage);
  chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Settings
  baseUrlInput?.addEventListener('change', saveSettings);
  apiKeyInput?.addEventListener('change', saveSettings);
  modelInput?.addEventListener('change', saveSettings);
  mcpeServerUrlInput?.addEventListener('change', saveSettings);
  vapidPublicKeyInput?.addEventListener('change', saveSettings);
  notificationsToggle?.addEventListener('change', saveSettings);
  clearHistoryBtn?.addEventListener('click', clearHistory);
  exportConfigBtn?.addEventListener('click', exportConfig);
  importConfigBtn?.addEventListener('click', () => importFileInput?.click());
  importFileInput?.addEventListener('change', importConfig);

  // Events - SSE Connection
  testConnectionBtn?.addEventListener('click', testMCPEConnection);
  connectSseBtn?.addEventListener('click', connectToMCPE);
  disconnectSseBtn?.addEventListener('click', disconnectFromMCPE);

  // Events - Push
  subscribePushBtn?.addEventListener('click', subscribeToPush);
  unsubscribePushBtn?.addEventListener('click', unsubscribeFromPush);

  // Events - Subscriptions
  addSubscriptionBtn?.addEventListener('click', () => showModal());
  refreshSubscriptionsBtn?.addEventListener('click', refreshServerSubscriptions);
  clearEventsBtn?.addEventListener('click', clearEvents);

  // Modal
  saveSubscriptionBtn?.addEventListener('click', saveSubscription);
  cancelSubscriptionBtn?.addEventListener('click', hideModal);
  subscriptionModal?.addEventListener('click', (e) => {
    if (e.target === subscriptionModal) hideModal();
  });

  // MCP Tab
  refreshMcpNotificationsBtn?.addEventListener('click', loadMCPNotifications);
  clearMcpNotificationsBtn?.addEventListener('click', clearMCPNotifications);
  sendTestNotificationBtn?.addEventListener('click', sendTestNotification);

  // Approved Sites
  addSiteBtn?.addEventListener('click', addApprovedSite);
  newSiteInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addApprovedSite();
  });
  approveCurrentSiteBtn?.addEventListener('click', approveCurrentSite);
}

// Tab Management
function switchTab(tabName) {
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

// ==================== Settings Management ====================

async function loadSettings() {
  const settings = await chrome.storage.local.get([
    'baseUrl',
    'apiKey',
    'model',
    'mcpeServerUrl',
    'vapidPublicKey',
    'notificationsEnabled'
  ]);

  if (settings.baseUrl) baseUrlInput.value = settings.baseUrl;
  if (settings.apiKey) apiKeyInput.value = settings.apiKey;
  if (settings.model) modelInput.value = settings.model;
  if (settings.mcpeServerUrl) mcpeServerUrlInput.value = settings.mcpeServerUrl;
  if (settings.vapidPublicKey) vapidPublicKeyInput.value = settings.vapidPublicKey;
  if (settings.notificationsEnabled !== undefined) {
    notificationsToggle.checked = settings.notificationsEnabled;
  }
}

async function saveSettings() {
  const settings = {
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    mcpeServerUrl: mcpeServerUrlInput.value.trim(),
    vapidPublicKey: vapidPublicKeyInput.value.trim(),
    notificationsEnabled: notificationsToggle.checked
  };

  await chrome.storage.local.set(settings);
  showStatus('Settings saved', 'success');
}

function showStatus(message, type) {
  settingsStatus.textContent = message;
  settingsStatus.className = `status ${type}`;
  setTimeout(() => {
    settingsStatus.textContent = '';
    settingsStatus.className = '';
  }, 2000);
}

// ==================== Config Import/Export ====================

async function exportConfig() {
  const data = await chrome.storage.local.get(null);

  // Create config object (excluding sensitive data option)
  const config = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    settings: {
      baseUrl: data.baseUrl || '',
      model: data.model || '',
      mcpeServerUrl: data.mcpeServerUrl || '',
      vapidPublicKey: data.vapidPublicKey || '',
      notificationsEnabled: data.notificationsEnabled !== false
    },
    subscriptions: data.mcpeSubscriptions || []
  };

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'mcpe-config.json';
  a.click();

  URL.revokeObjectURL(url);
  showStatus('Config exported', 'success');
}

async function importConfig(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const config = JSON.parse(text);

    if (config.settings) {
      if (config.settings.baseUrl) baseUrlInput.value = config.settings.baseUrl;
      if (config.settings.model) modelInput.value = config.settings.model;
      if (config.settings.mcpeServerUrl) mcpeServerUrlInput.value = config.settings.mcpeServerUrl;
      if (config.settings.vapidPublicKey) vapidPublicKeyInput.value = config.settings.vapidPublicKey;
      if (config.settings.notificationsEnabled !== undefined) {
        notificationsToggle.checked = config.settings.notificationsEnabled;
      }
      await saveSettings();
    }

    if (config.subscriptions && Array.isArray(config.subscriptions)) {
      mcpeSubscriptions = config.subscriptions;
      await saveMcpeSubscriptions();
      renderSubscriptions();
    }

    showStatus('Config imported', 'success');
  } catch (error) {
    showStatus('Invalid config file', 'error');
  }

  // Reset file input
  event.target.value = '';
}

// ==================== Chat History Management ====================

async function loadChatHistory() {
  const data = await chrome.storage.local.get(['chatHistory']);
  chatHistory = data.chatHistory || [];
  renderMessages();
}

async function saveChatHistory() {
  await chrome.storage.local.set({ chatHistory });
}

async function clearHistory() {
  chatHistory = [];
  await saveChatHistory();
  renderMessages();
  showStatus('History cleared', 'success');
}

// Message Rendering
function renderMessages() {
  if (chatHistory.length === 0) {
    chatMessages.innerHTML = `
      <div class="empty-state">
        Send a message to start chatting with AI
      </div>
    `;
    return;
  }

  chatMessages.innerHTML = chatHistory
    .map(msg => `<div class="message ${msg.role}">${escapeHtml(msg.content)}</div>`)
    .join('');

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessage(role, content) {
  chatHistory.push({ role, content });
  renderMessages();
  saveChatHistory();
}

function addErrorMessage(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'message error';
  errorDiv.textContent = message;
  chatMessages.appendChild(errorDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== Chat Functionality ====================

async function sendMessage() {
  const message = chatInput.value.trim();
  if (!message || isLoading) return;

  const settings = await chrome.storage.local.get(['baseUrl', 'apiKey', 'model', 'notificationsEnabled']);

  if (!settings.apiKey) {
    addErrorMessage('Please add your API key in Settings');
    switchTab('settings');
    return;
  }

  addMessage('user', message);
  chatInput.value = '';

  isLoading = true;
  sendBtn.disabled = true;
  chatInput.disabled = true;

  try {
    const response = await callOpenAI(
      message,
      settings.apiKey,
      settings.model || 'gpt-4o-mini',
      settings.baseUrl || 'https://api.openai.com/v1'
    );

    addMessage('assistant', response);

    if (settings.notificationsEnabled !== false) {
      chrome.runtime.sendMessage({
        type: 'showNotification',
        title: 'AI Response',
        body: response.substring(0, 100) + (response.length > 100 ? '...' : '')
      });
    }
  } catch (error) {
    addErrorMessage(`Error: ${error.message}`);
  } finally {
    isLoading = false;
    sendBtn.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
  }
}

async function callOpenAI(message, apiKey, model, baseUrl) {
  const messages = [
    { role: 'system', content: 'You are a helpful assistant. Keep responses concise.' },
    ...chatHistory.slice(-10).map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    { role: 'user', content: message }
  ];

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ==================== MCPE SSE Connection ====================

async function testMCPEConnection() {
  const settings = await chrome.storage.local.get(['mcpeServerUrl']);

  if (!settings.mcpeServerUrl) {
    alert('Please set MCPE Server URL in Settings first');
    switchTab('settings');
    return;
  }

  const serverUrl = settings.mcpeServerUrl.replace(/\/+$/, '');
  sseStatusText.textContent = 'Testing...';

  try {
    // Test health endpoint
    const healthRes = await fetch(`${serverUrl}/health`);
    const healthData = await healthRes.json();

    // Test subscriptions endpoint
    const subsRes = await fetch(`${serverUrl}/api/mcpe/subscriptions`);
    const subsData = await subsRes.json();

    alert(`Server is reachable!\n\nHealth: ${JSON.stringify(healthData)}\n\nSubscriptions: ${subsData.subscriptions?.length || 0} found\n\nSSE endpoint: ${serverUrl}/chat/events`);
    sseStatusText.textContent = 'Server OK - Ready to connect';
  } catch (error) {
    alert(`Connection test failed!\n\nURL: ${serverUrl}\nError: ${error.message}\n\nMake sure:\n1. Server is running\n2. URL is correct (no trailing slash)\n3. CORS is enabled`);
    sseStatusText.textContent = 'Test failed';
  }
}

async function connectToMCPE() {
  const settings = await chrome.storage.local.get(['mcpeServerUrl']);

  if (!settings.mcpeServerUrl) {
    showStatus('Please set MCPE Server URL in Settings', 'error');
    switchTab('settings');
    return;
  }

  try {
    updateSseStatus('connecting');
    console.log('[Popup] Connecting to MCPE server:', settings.mcpeServerUrl);

    // Create client
    mcpeClient = new MCPEClient(settings.mcpeServerUrl);

    // Set up event handlers
    mcpeClient.on('connect', () => {
      updateSseStatus('connected');
      showStatus('Connected to MCPE', 'success');
      // Re-register subscriptions
      syncSubscriptionsWithServer();
    });

    mcpeClient.on('disconnect', () => {
      updateSseStatus('disconnected');
    });

    mcpeClient.on('error', (err) => {
      console.error('MCPE error:', err);
      updateSseStatus('disconnected');
    });

    // Listen for all events
    mcpeClient.onEvent('*', (event, subscriptionId) => {
      console.log('Event received:', event);
      addReceivedEvent(event);

      // Show notification if enabled
      chrome.storage.local.get(['notificationsEnabled']).then((settings) => {
        if (settings.notificationsEnabled !== false) {
          chrome.runtime.sendMessage({
            type: 'showNotification',
            title: `Event: ${event.type}`,
            body: event.data?.message || JSON.stringify(event.data).substring(0, 100)
          });
        }
      });
    });

    // Connect
    await mcpeClient.connect();

  } catch (error) {
    console.error('MCPE connection error:', error);
    updateSseStatus('disconnected');
    showStatus(`Failed: ${error.message}`, 'error');
    // Show the URL we tried to connect to
    alert(`Connection failed to: ${settings.mcpeServerUrl}/chat/events\n\nError: ${error.message}\n\nMake sure the MCPE server is running and the URL is correct.`);
  }
}

function disconnectFromMCPE() {
  if (mcpeClient) {
    mcpeClient.disconnect();
    mcpeClient = null;
  }
  updateSseStatus('disconnected');
  showStatus('Disconnected from MCPE', 'success');
}

function updateSseStatus(state) {
  switch (state) {
    case 'connected':
      sseStatusText.textContent = 'Connected';
      sseIndicator.className = 'status-indicator connected';
      connectSseBtn.style.display = 'none';
      disconnectSseBtn.style.display = 'block';
      break;
    case 'connecting':
      sseStatusText.textContent = 'Connecting...';
      sseIndicator.className = 'status-indicator pending';
      connectSseBtn.style.display = 'none';
      disconnectSseBtn.style.display = 'none';
      break;
    case 'disconnected':
    default:
      sseStatusText.textContent = 'Disconnected';
      sseIndicator.className = 'status-indicator disconnected';
      connectSseBtn.style.display = 'block';
      disconnectSseBtn.style.display = 'none';
      break;
  }
}

async function syncSubscriptionsWithServer() {
  if (!mcpeClient || !mcpeClient.isConnected()) return;

  try {
    // Fetch server subscriptions
    const result = await mcpeClient.listSubscriptions();
    console.log('Server subscriptions:', result);

    // Mark local subscriptions as synced if they exist on server
    if (result.subscriptions) {
      for (const serverSub of result.subscriptions) {
        const localSub = mcpeSubscriptions.find(s => s.name === serverSub.name);
        if (localSub) {
          localSub.serverId = serverSub.name;
          localSub.enabled = serverSub.enabled;
        }
      }
      await saveMcpeSubscriptions();
      renderSubscriptions();
    }
  } catch (error) {
    console.error('Failed to sync subscriptions:', error);
  }
}

async function refreshServerSubscriptions() {
  if (mcpeClient && mcpeClient.isConnected()) {
    try {
      const result = await mcpeClient.listSubscriptions();
      console.log('Server subscriptions:', result);
      showStatus(`${result.subscriptions?.length || 0} server subscriptions`, 'success');
    } catch (error) {
      console.error('Failed to list subscriptions:', error);
    }
  }
  renderSubscriptions();
}

function addReceivedEvent(event) {
  recentEvents.push({
    type: event.type,
    source: event.metadata?.source || 'unknown',
    data: event.data,
    timestamp: event.metadata?.timestamp || new Date().toISOString()
  });
  saveRecentEvents();
  renderEvents();
}

// ==================== Push Notifications ====================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function checkPushSubscription() {
  try {
    const registration = await navigator.serviceWorker.ready;
    pushSubscription = await registration.pushManager.getSubscription();
    updatePushStatus();
  } catch (error) {
    console.error('Error checking push subscription:', error);
  }
}

function updatePushStatus() {
  if (pushSubscription) {
    pushStatusText.textContent = 'Subscribed to push notifications';
    pushStatusIndicator.className = 'status-indicator connected';
    subscribePushBtn.style.display = 'none';
    unsubscribePushBtn.style.display = 'block';
  } else {
    pushStatusText.textContent = 'Not subscribed';
    pushStatusIndicator.className = 'status-indicator disconnected';
    subscribePushBtn.style.display = 'block';
    unsubscribePushBtn.style.display = 'none';
  }
}

async function subscribeToPush() {
  const settings = await chrome.storage.local.get(['mcpeServerUrl', 'vapidPublicKey']);

  if (!settings.vapidPublicKey) {
    showStatus('Please set VAPID public key in Settings', 'error');
    switchTab('settings');
    return;
  }

  try {
    pushStatusText.textContent = 'Subscribing...';
    pushStatusIndicator.className = 'status-indicator pending';

    // Register service worker if not already registered
    const registration = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    // Subscribe to push
    pushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey)
    });

    // Save subscription locally
    await chrome.storage.local.set({
      pushSubscription: pushSubscription.toJSON()
    });

    // Send subscription to MCPE server if configured
    if (settings.mcpeServerUrl) {
      await registerPushWithServer(settings.mcpeServerUrl, pushSubscription);
    }

    updatePushStatus();
    showStatus('Push subscription created', 'success');
  } catch (error) {
    console.error('Push subscription error:', error);
    pushStatusText.textContent = 'Subscription failed';
    pushStatusIndicator.className = 'status-indicator disconnected';
    showStatus(`Error: ${error.message}`, 'error');
  }
}

async function unsubscribeFromPush() {
  try {
    if (pushSubscription) {
      await pushSubscription.unsubscribe();
      pushSubscription = null;
      await chrome.storage.local.remove('pushSubscription');
    }
    updatePushStatus();
    showStatus('Unsubscribed from push', 'success');
  } catch (error) {
    console.error('Unsubscribe error:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

async function registerPushWithServer(serverUrl, subscription) {
  const url = serverUrl.replace(/\/+$/, '') + '/api/push/subscribe';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      userAgent: navigator.userAgent
    })
  });

  if (!response.ok) {
    console.warn('Failed to register push with server:', response.status);
  }
}

// ==================== MCPE Subscriptions ====================

async function loadMcpeSubscriptions() {
  const data = await chrome.storage.local.get(['mcpeSubscriptions']);
  mcpeSubscriptions = data.mcpeSubscriptions || [];
  renderSubscriptions();
}

async function saveMcpeSubscriptions() {
  await chrome.storage.local.set({ mcpeSubscriptions });
}

function renderSubscriptions() {
  if (mcpeSubscriptions.length === 0) {
    subscriptionsList.innerHTML = `
      <div class="empty-state small">No subscriptions configured</div>
    `;
    return;
  }

  const isConnected = mcpeClient && mcpeClient.isConnected();

  subscriptionsList.innerHTML = mcpeSubscriptions.map((sub, index) => `
    <div class="subscription-item">
      <div class="subscription-info">
        <div class="subscription-name">
          ${escapeHtml(sub.name)}
          ${sub.serverId && isConnected ? '<span class="badge badge-active" title="Synced with server">synced</span>' : ''}
        </div>
        <div class="subscription-details">
          ${sub.eventTypes?.length ? sub.eventTypes.join(', ') : 'all events'}
          <span class="badge badge-${sub.enabled !== false ? 'active' : 'paused'}">
            ${sub.enabled !== false ? 'active' : 'paused'}
          </span>
        </div>
      </div>
      <div class="subscription-actions">
        <button class="btn btn-icon btn-secondary" onclick="toggleSubscription(${index})" title="${sub.enabled !== false ? 'Pause' : 'Resume'}">
          ${sub.enabled !== false ? '⏸' : '▶'}
        </button>
        <button class="btn btn-icon btn-danger" onclick="deleteSubscription(${index})" title="Delete">
          ✕
        </button>
      </div>
    </div>
  `).join('');
}

function showModal() {
  subNameInput.value = '';
  subEventTypesInput.value = '';
  subSourcesInput.value = '';
  subHandlerSelect.value = 'notification';
  subscriptionModal.style.display = 'flex';
}

function hideModal() {
  subscriptionModal.style.display = 'none';
}

async function saveSubscription() {
  const name = subNameInput.value.trim();
  if (!name) {
    alert('Please enter a subscription name');
    return;
  }

  const subscription = {
    id: crypto.randomUUID(),
    name: name,
    eventTypes: subEventTypesInput.value.split(',').map(s => s.trim()).filter(Boolean),
    sources: subSourcesInput.value.split(',').map(s => s.trim()).filter(Boolean),
    handler: {
      type: subHandlerSelect.value
    },
    enabled: true,
    createdAt: new Date().toISOString()
  };

  // Register with MCPE server if connected
  if (mcpeClient && mcpeClient.isConnected()) {
    try {
      await mcpeClient.subscribe({
        name: subscription.name,
        filter: {
          eventTypes: subscription.eventTypes.length ? subscription.eventTypes : undefined,
          sources: subscription.sources.length ? subscription.sources : undefined
        }
      });
      subscription.serverId = subscription.name;
      showStatus('Subscription registered with server', 'success');
    } catch (error) {
      console.error('Failed to register with server:', error);
      showStatus('Saved locally (server registration failed)', 'error');
    }
  }

  mcpeSubscriptions.push(subscription);
  await saveMcpeSubscriptions();
  renderSubscriptions();
  hideModal();
}

window.toggleSubscription = async function(index) {
  const sub = mcpeSubscriptions[index];
  sub.enabled = !sub.enabled;

  // Update on server if connected
  if (mcpeClient && mcpeClient.isConnected() && sub.serverId) {
    try {
      await mcpeClient.toggleSubscription(sub.name, sub.enabled);
    } catch (error) {
      console.error('Failed to update subscription on server:', error);
    }
  }

  await saveMcpeSubscriptions();
  renderSubscriptions();
};

window.deleteSubscription = async function(index) {
  const sub = mcpeSubscriptions[index];

  // Delete on server if connected and synced
  if (mcpeClient && mcpeClient.isConnected() && sub.serverId) {
    try {
      await mcpeClient.deleteSubscription(sub.name);
    } catch (error) {
      console.error('Failed to delete on server:', error);
    }
  }

  mcpeSubscriptions.splice(index, 1);
  await saveMcpeSubscriptions();
  renderSubscriptions();
};

// ==================== Recent Events ====================

async function loadRecentEvents() {
  const data = await chrome.storage.local.get(['recentEvents']);
  recentEvents = data.recentEvents || [];
  renderEvents();
}

async function saveRecentEvents() {
  // Keep only last 50 events
  recentEvents = recentEvents.slice(-50);
  await chrome.storage.local.set({ recentEvents });
}

function renderEvents() {
  if (recentEvents.length === 0) {
    eventsList.innerHTML = `
      <div class="empty-state small">No events received yet</div>
    `;
    return;
  }

  eventsList.innerHTML = recentEvents.slice().reverse().map(event => `
    <div class="event-item">
      <div class="event-info">
        <div class="event-type">${escapeHtml(event.type || 'unknown')}</div>
        <div class="event-time">${formatTime(event.timestamp)}</div>
      </div>
      <span class="badge badge-source">${escapeHtml(event.source || 'custom')}</span>
    </div>
  `).join('');
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

async function clearEvents() {
  recentEvents = [];
  await saveRecentEvents();
  renderEvents();
}

// Add event from push notification or other source
window.addEvent = async function(event) {
  recentEvents.push({
    ...event,
    timestamp: event.timestamp || new Date().toISOString()
  });
  await saveRecentEvents();
  renderEvents();
};

// Listen for messages from service worker
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data.type === 'pushEvent') {
    window.addEvent(event.data.event);
  }
});

// ==================== MCP Server Integration ====================

async function loadMCPNotifications() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getNotifications' });
    renderMCPNotifications(response.notifications || []);
  } catch (error) {
    console.error('Failed to load MCP notifications:', error);
    mcpNotificationsList.innerHTML = `<div class="empty-state small">Error loading notifications</div>`;
  }
}

function renderMCPNotifications(notifications) {
  if (!notifications || notifications.length === 0) {
    mcpNotificationsList.innerHTML = `<div class="empty-state small">No notifications captured yet</div>`;
    return;
  }

  mcpNotificationsList.innerHTML = notifications.slice().reverse().slice(0, 20).map(n => `
    <div class="event-item">
      <div class="event-info">
        <div class="event-type">${escapeHtml(n.title || 'Notification')}</div>
        <div class="event-time">${escapeHtml(n.body || '').substring(0, 50)}</div>
      </div>
      <span class="badge badge-source">${escapeHtml(n.source || 'unknown')}</span>
    </div>
  `).join('');
}

async function clearMCPNotifications() {
  try {
    await callMCPTool('clear_notifications');
    await loadMCPNotifications();
  } catch (error) {
    console.error('Failed to clear notifications:', error);
  }
}

async function sendTestNotification() {
  const title = testNotifTitle.value.trim() || 'Test Notification';
  const body = testNotifBody.value.trim() || 'This is a test notification from the extension';

  try {
    // Send via chrome.runtime to background, which adds to MCP server
    await chrome.runtime.sendMessage({
      type: 'addNotification',
      notification: {
        title,
        body,
        source: 'test',
        data: { test: true, timestamp: Date.now() }
      }
    });

    // Also show as Chrome notification
    await chrome.runtime.sendMessage({
      type: 'showNotification',
      title,
      body
    });

    testNotifTitle.value = '';
    testNotifBody.value = '';
    await loadMCPNotifications();
    showStatus('Test notification sent', 'success');
  } catch (error) {
    console.error('Failed to send test notification:', error);
    showStatus('Failed to send notification', 'error');
  }
}

window.callMCPTool = async function(toolName, args = {}) {
  mcpResult.style.display = 'block';
  mcpResultContent.textContent = 'Loading...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'mcp-request',
      request: {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      }
    });

    if (response.error) {
      mcpResultContent.textContent = `Error: ${response.error.message}`;
    } else if (response.result?.content?.[0]?.text) {
      mcpResultContent.textContent = response.result.content[0].text;
    } else {
      mcpResultContent.textContent = JSON.stringify(response.result, null, 2);
    }

    // Refresh notifications list if we called a relevant tool
    if (['clear_notifications', 'list_notifications'].includes(toolName)) {
      await loadMCPNotifications();
    }
  } catch (error) {
    mcpResultContent.textContent = `Error: ${error.message}`;
  }
};

// ==================== Approved Sites Management ====================

async function loadApprovedSites() {
  const data = await chrome.storage.local.get(['approvedSites']);
  approvedSites = data.approvedSites || [];
  renderApprovedSites();
}

async function saveApprovedSites() {
  await chrome.storage.local.set({ approvedSites });
}

function renderApprovedSites() {
  if (!approvedSitesList) return;

  if (approvedSites.length === 0) {
    approvedSitesList.innerHTML = `<div class="empty-state small">No sites approved yet</div>`;
    return;
  }

  approvedSitesList.innerHTML = approvedSites.map((site, index) => `
    <div class="subscription-item">
      <div class="subscription-info">
        <div class="subscription-name">${escapeHtml(site)}</div>
      </div>
      <div class="subscription-actions">
        <button class="btn btn-icon btn-danger" onclick="removeApprovedSite(${index})" title="Remove">
          ✕
        </button>
      </div>
    </div>
  `).join('');
}

async function addApprovedSite() {
  const site = newSiteInput?.value.trim().toLowerCase();
  if (!site) return;

  // Validate site pattern
  if (!isValidSitePattern(site)) {
    showStatus('Invalid site pattern', 'error');
    return;
  }

  // Check for duplicates
  if (approvedSites.includes(site)) {
    showStatus('Site already approved', 'error');
    return;
  }

  approvedSites.push(site);
  await saveApprovedSites();
  renderApprovedSites();
  newSiteInput.value = '';
  showStatus(`Added ${site}`, 'success');
}

function isValidSitePattern(pattern) {
  // Allow: domain.com, sub.domain.com, *.domain.com
  const siteRegex = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
  return siteRegex.test(pattern);
}

window.removeApprovedSite = async function(index) {
  const site = approvedSites[index];
  approvedSites.splice(index, 1);
  await saveApprovedSites();
  renderApprovedSites();
  showStatus(`Removed ${site}`, 'success');
};

async function approveCurrentSite() {
  try {
    // Get current tab's URL
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url) {
      showStatus('Cannot get current tab URL', 'error');
      return;
    }

    const url = new URL(tab.url);
    const hostname = url.hostname;

    // Chrome URLs and other special pages can't be approved
    if (hostname === '' || url.protocol === 'chrome:' || url.protocol === 'chrome-extension:') {
      showStatus('Cannot approve this page', 'error');
      return;
    }

    // Check for duplicates
    if (approvedSites.includes(hostname)) {
      showStatus('Site already approved', 'error');
      return;
    }

    approvedSites.push(hostname);
    await saveApprovedSites();
    renderApprovedSites();
    showStatus(`Approved ${hostname}`, 'success');

    // Inject content script into the current tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-script.js']
      });
      console.log('[Popup] Content script injected into current tab');
    } catch (injectError) {
      console.warn('[Popup] Could not inject content script:', injectError);
    }
  } catch (error) {
    console.error('Error approving current site:', error);
    showStatus('Failed to approve site', 'error');
  }
}
