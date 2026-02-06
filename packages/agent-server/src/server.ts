import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runAgent, addSSEClient } from './agent.js';
import { getMCPEInstance } from './mcpe-integration.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Messages storage
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const MESSAGES_FILE = join(__dirname, '..', 'messages.json');

function loadMessages(): ChatMessage[] {
  try {
    if (existsSync(MESSAGES_FILE)) {
      const content = readFileSync(MESSAGES_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[Messages] Failed to load:', error);
  }
  return [];
}

function saveMessages(messages: ChatMessage[]): void {
  try {
    writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.error('[Messages] Failed to save:', error);
  }
}

function addMessage(role: 'user' | 'assistant', content: string): ChatMessage {
  const messages = loadMessages();
  const message: ChatMessage = {
    role,
    content,
    timestamp: new Date().toISOString(),
  };
  messages.push(message);
  saveMessages(messages);
  return message;
}

function clearMessages(): void {
  saveMessages([]);
}
import {
  getAllTools,
  setToolEnabled,
  addCustomTool,
  removeCustomTool,
  listMCPServers,
  addMCPServer,
  removeMCPServer,
  enableMCPServer,
  importMCPConfig,
  exportMCPConfig,
} from './mcp-config.js';
import {
  getEventsServer,
  publishEvent,
  createSampleEvent,
  createAlertEvent,
  createErrorEvent,
  createAnalyzeEvent,
  getDemoInfo,
  reloadSubscriptions as reloadEventSubscriptions,
  getEventHistory,
} from './events-demo.js';
import {
  getExamples,
  getExampleById,
  getIntegrationStatus,
  getAllIntegrationStatuses,
  enableIntegration,
  disableIntegration,
  updateIntegrationSubscriptions,
  setPendingOAuthToken,
  getPendingOAuthToken,
  clearPendingOAuthToken,
  setOAuthUserInfo,
  getOAuthUserInfo,
  setOAuthRepos,
  getOAuthRepos,
  getGoogleToken,
} from './examples.js';
import { processGitHubWebhook, processGenericWebhook, processGoogleWebhook } from './webhooks.js';
import { createEvent } from '@mcpe/core';
import { getSubscriptionsJSON, getConfigPath, setSubscriptionEnabled, deleteSubscription, addSubscription, getRawConfig, setRawConfig } from './mcpe-config.js';

// Request validation schemas
const RegisterRequestSchema = z.object({
  mcpeUrl: z.string().url().optional(),
  filter: z.object({
    sources: z.array(z.enum(['github', 'gmail', 'slack', 'custom'])).optional(),
    eventTypes: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    priority: z.array(z.enum(['low', 'normal', 'high', 'critical'])).optional(),
  }).optional(),
  prompt: z.string().optional(),
});

type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

// Static HTML content (embedded for simplicity in deployment)
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCPE Agent Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; height: 100vh; display: flex; }
    .sidebar { width: 320px; background: #16213e; border-right: 1px solid #0f3460; display: flex; flex-direction: column; overflow: hidden; }
    .sidebar-header { padding: 16px; background: #0f3460; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .sidebar-tabs { display: flex; border-bottom: 1px solid #0f3460; }
    .sidebar-tab { flex: 1; padding: 10px 8px; text-align: center; cursor: pointer; background: transparent; border: none; color: #888; font-size: 12px; transition: all 0.2s; }
    .sidebar-tab:hover { color: #eee; background: rgba(255,255,255,0.05); }
    .sidebar-tab.active { color: #e94560; border-bottom: 2px solid #e94560; }
    .sidebar-content { flex: 1; overflow-y: auto; padding: 12px; }
    .panel { display: none; }
    .panel.active { display: block; }
    .tool-item, .mcp-item { background: #1a1a2e; border-radius: 8px; padding: 12px; margin-bottom: 8px; border: 1px solid #0f3460; }
    .tool-header, .mcp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .tool-name, .mcp-name { font-weight: 600; font-size: 14px; color: #e94560; }
    .mcp-name { color: #eee; }
    .tool-source { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #0f3460; color: #888; }
    .tool-description, .mcp-command { font-size: 12px; color: #888; margin-bottom: 8px; }
    .mcp-command { font-family: monospace; margin-top: 4px; margin-bottom: 0; }
    .tool-actions { display: flex; gap: 8px; align-items: center; }
    .toggle { position: relative; width: 40px; height: 20px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: #333; border-radius: 20px; transition: 0.3s; }
    .toggle-slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background: #888; border-radius: 50%; transition: 0.3s; }
    .toggle input:checked + .toggle-slider { background: #e94560; }
    .toggle input:checked + .toggle-slider:before { transform: translateX(20px); background: white; }
    .mcp-status { font-size: 11px; padding: 2px 8px; border-radius: 4px; }
    .mcp-status.enabled { background: rgba(0, 200, 83, 0.2); color: #00c853; }
    .mcp-status.disabled { background: rgba(255, 82, 82, 0.2); color: #ff5252; }
    .btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .btn-primary { background: #e94560; color: white; }
    .btn-primary:hover { background: #ff6b6b; }
    .btn-secondary { background: #0f3460; color: #eee; }
    .btn-secondary:hover { background: #1a4a7a; }
    .btn-danger { background: transparent; color: #ff5252; border: 1px solid #ff5252; }
    .btn-danger:hover { background: rgba(255, 82, 82, 0.1); }
    .btn-delete { background: transparent; border: none; color: #666; cursor: pointer; font-size: 18px; padding: 2px 6px; border-radius: 4px; transition: all 0.2s; line-height: 1; }
    .btn-delete:hover { background: rgba(255, 82, 82, 0.2); color: #ff5252; }
    .btn-sm { padding: 4px 8px; font-size: 11px; }
    .add-form { margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px; border: 1px dashed #0f3460; }
    .add-form h4 { margin-bottom: 12px; font-size: 13px; color: #888; }
    .form-group { margin-bottom: 10px; }
    .form-group label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }
    .form-group input, .form-group textarea { width: 100%; padding: 8px; border: 1px solid #0f3460; border-radius: 4px; background: #16213e; color: #eee; font-size: 13px; }
    .form-group textarea { min-height: 60px; resize: vertical; font-family: monospace; }
    .main { flex: 1; display: flex; flex-direction: column; background: #1a1a2e; }
    .chat-header { padding: 16px 24px; background: #16213e; border-bottom: 1px solid #0f3460; display: flex; justify-content: space-between; align-items: center; }
    .chat-header h1 { font-size: 18px; font-weight: 600; }
    .connection-status { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #888; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #ff5252; }
    .status-dot.connected { background: #00c853; }
    .chat-messages { flex: 1; overflow-y: auto; padding: 24px; }
    .message { max-width: 80%; margin-bottom: 16px; animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .message.user { margin-left: auto; }
    .message-content { padding: 12px 16px; border-radius: 12px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
    .message.user .message-content { background: #e94560; color: white; border-bottom-right-radius: 4px; }
    .message.assistant .message-content { background: #16213e; border: 1px solid #0f3460; border-bottom-left-radius: 4px; }
    .message-meta { font-size: 11px; color: #666; margin-top: 4px; padding: 0 4px; }
    .message.user .message-meta { text-align: right; }
    .chat-input-container { padding: 16px 24px; background: #16213e; border-top: 1px solid #0f3460; }
    .chat-input-wrapper { display: flex; gap: 12px; align-items: flex-end; }
    .chat-input { flex: 1; padding: 12px 16px; border: 1px solid #0f3460; border-radius: 8px; background: #1a1a2e; color: #eee; font-size: 14px; resize: none; min-height: 48px; max-height: 120px; }
    .chat-input:focus { outline: none; border-color: #e94560; }
    .send-btn { padding: 12px 24px; background: #e94560; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; }
    .send-btn:hover { background: #ff6b6b; }
    .send-btn:disabled { background: #333; cursor: not-allowed; }
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); justify-content: center; align-items: center; z-index: 1000; }
    .modal-overlay.active { display: flex; }
    .modal { background: #16213e; border-radius: 12px; padding: 24px; width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; }
    .modal h3 { margin-bottom: 16px; }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .json-editor { width: 100%; min-height: 200px; padding: 12px; border: 1px solid #0f3460; border-radius: 8px; background: #1a1a2e; color: #eee; font-family: monospace; font-size: 13px; resize: vertical; }
    .example-card { background: #1a1a2e; border-radius: 8px; padding: 14px; margin-bottom: 10px; border: 1px solid #0f3460; cursor: pointer; transition: all 0.2s; }
    .example-card:hover { border-color: #e94560; transform: translateY(-1px); }
    .example-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .example-title { display: flex; align-items: center; gap: 8px; }
    .example-icon { font-size: 20px; }
    .example-name { font-weight: 600; font-size: 14px; color: #eee; }
    .example-difficulty { font-size: 10px; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
    .example-difficulty.beginner { background: rgba(0, 200, 83, 0.2); color: #00c853; }
    .example-difficulty.intermediate { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
    .example-difficulty.advanced { background: rgba(233, 69, 96, 0.2); color: #e94560; }
    .example-description { font-size: 12px; color: #888; margin-bottom: 10px; line-height: 1.4; }
    .example-tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .example-tag { font-size: 10px; padding: 2px 6px; background: #0f3460; border-radius: 4px; color: #888; }
    .example-modal { max-width: 600px; max-height: 85vh; }
    .example-modal h3 { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .example-modal .example-meta { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; font-size: 12px; color: #888; }
    .setup-step { background: #1a1a2e; border-radius: 8px; padding: 14px; margin-bottom: 12px; border: 1px solid #0f3460; }
    .setup-step h4 { font-size: 13px; color: #e94560; margin-bottom: 8px; }
    .setup-step p { font-size: 12px; color: #aaa; margin-bottom: 10px; line-height: 1.5; }
    .setup-step pre { background: #0d1117; padding: 10px; border-radius: 6px; font-size: 11px; overflow-x: auto; margin: 0; color: #c9d1d9; }
    .setup-step code { font-family: 'SF Mono', Monaco, monospace; }
    .example-card.interactive { border: 1px solid #e94560; background: linear-gradient(135deg, #1a1a2e 0%, #1f1f3a 100%); }
    .example-card.interactive .example-name { color: #e94560; }
    .example-badge { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #e94560; color: white; margin-left: 8px; text-transform: uppercase; }
    .example-badge.enabled { background: #00c853; }
    .example-actions { display: flex; gap: 8px; margin-top: 12px; }
    .config-modal { max-width: 550px; }
    .config-section { margin-bottom: 20px; }
    .config-section h4 { font-size: 14px; color: #e94560; margin-bottom: 12px; border-bottom: 1px solid #0f3460; padding-bottom: 8px; }
    .config-field { margin-bottom: 14px; }
    .config-field label { display: block; font-size: 13px; color: #eee; margin-bottom: 6px; }
    .config-field input { width: 100%; padding: 10px 12px; border: 1px solid #0f3460; border-radius: 6px; background: #1a1a2e; color: #eee; font-size: 13px; }
    .config-field input:focus { outline: none; border-color: #e94560; }
    .config-field .field-desc { font-size: 11px; color: #666; margin-top: 4px; }
    .config-field .field-desc a { color: #e94560; text-decoration: none; }
    .config-field .field-desc a:hover { text-decoration: underline; }
    .oauth-btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 12px; }
    .oauth-btn:hover { background: #333; }
    .oauth-connected { display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(0, 200, 83, 0.1); border: 1px solid rgba(0, 200, 83, 0.3); border-radius: 6px; }
    .oauth-avatar { width: 40px; height: 40px; border-radius: 50%; }
    .oauth-user { flex: 1; }
    .oauth-user strong { display: block; color: #eee; }
    .oauth-user span { font-size: 12px; color: #888; }
    .repo-selector { position: relative; }
    .repo-selector input { width: 100%; }
    .repo-dropdown { position: absolute; top: 100%; left: 0; right: 0; background: #16213e; border: 1px solid #0f3460; border-radius: 4px; max-height: 200px; overflow-y: auto; z-index: 100; display: none; margin-top: 4px; }
    .repo-item { padding: 10px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #0f3460; }
    .repo-item:last-child { border-bottom: none; }
    .repo-item:hover { background: #0f3460; }
    .repo-name { color: #eee; font-size: 13px; }
    .repo-private { font-size: 10px; padding: 2px 6px; background: rgba(255, 193, 7, 0.2); color: #ffc107; border-radius: 3px; }
    .sub-checkbox { display: flex; align-items: flex-start; gap: 10px; padding: 10px; background: #1a1a2e; border-radius: 6px; margin-bottom: 8px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
    .sub-checkbox:hover { border-color: #0f3460; }
    .sub-checkbox input { margin-top: 3px; accent-color: #e94560; }
    .sub-checkbox .sub-info { flex: 1; }
    .sub-checkbox .sub-name { font-size: 13px; color: #eee; font-weight: 500; }
    .sub-checkbox .sub-desc { font-size: 11px; color: #888; margin-top: 2px; }
    .sub-checkbox .sub-events { font-size: 10px; color: #666; margin-top: 4px; font-family: monospace; }
    .integration-status { display: flex; align-items: center; gap: 8px; padding: 12px; background: rgba(0, 200, 83, 0.1); border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(0, 200, 83, 0.3); }
    .integration-status.disabled { background: rgba(255, 82, 82, 0.1); border-color: rgba(255, 82, 82, 0.3); }
    .status-indicator { width: 10px; height: 10px; border-radius: 50%; background: #00c853; }
    .status-indicator.disabled { background: #ff5252; }
    .integration-status span { font-size: 13px; color: #aaa; }
    .loading { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #1a1a2e; }
    ::-webkit-scrollbar-thumb { background: #0f3460; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #1a4a7a; }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="sidebar-header">MCPE Agent Configuration</div>
    <div class="sidebar-tabs">
      <button class="sidebar-tab active" data-panel="tools">Tools</button>
      <button class="sidebar-tab" data-panel="mcp">MCP</button>
      <button class="sidebar-tab" data-panel="subs">Subs</button>
      <button class="sidebar-tab" data-panel="examples">Examples</button>
    </div>
    <div class="sidebar-content">
      <div id="tools-panel" class="panel active">
        <div id="tools-list"></div>
        <div class="add-form">
          <h4>Add Custom Tool</h4>
          <div class="form-group">
            <label>Tool Name</label>
            <input type="text" id="new-tool-name" placeholder="myTool">
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" id="new-tool-description" placeholder="What does this tool do?">
          </div>
          <button class="btn btn-primary" onclick="addTool()">Add Tool</button>
        </div>
      </div>
      <div id="mcp-panel" class="panel">
        <div id="mcp-list"></div>
        <div style="margin-top: 16px;">
          <button class="btn btn-primary" onclick="showMCPJsonModal()" style="width: 100%;">Edit MCP Servers (JSON)</button>
        </div>
      </div>
      <div id="subs-panel" class="panel">
        <div id="subs-list"></div>
        <div style="margin-top: 16px; display: flex; gap: 8px;">
          <button class="btn btn-primary" onclick="showAddSubModal()" style="flex: 1;">+ Add</button>
          <button class="btn btn-secondary" onclick="showSubsJsonModal()" style="flex: 1;">Edit JSON</button>
          <button class="btn btn-secondary" onclick="reloadSubscriptions()" title="Reload subscriptions from file">↻</button>
        </div>
        <div style="margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; color: #888; font-weight: 600;">Recent Events</span>
            <button class="btn btn-secondary btn-sm" onclick="refreshEventHistory()" style="padding: 2px 8px; font-size: 11px;">↻</button>
          </div>
          <div id="event-history" style="max-height: 200px; overflow-y: auto; background: #1a1a2e; border-radius: 8px; padding: 8px; font-size: 11px;">
            <p style="color: #666; text-align: center;">No events yet</p>
          </div>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px; border: 1px dashed #0f3460;">
          <p style="font-size: 12px; color: #888; margin-bottom: 8px;">Subscriptions are defined in mcpe.json</p>
          <p id="config-path" style="font-size: 11px; color: #666; font-family: monospace;"></p>
        </div>
      </div>
      <div id="examples-panel" class="panel">
        <div id="examples-list"></div>
      </div>
    </div>
  </aside>
  <main class="main">
    <header class="chat-header">
      <h1>MCPE Agent Chat</h1>
      <div style="display: flex; align-items: center; gap: 16px;">
        <button class="btn btn-danger btn-sm" onclick="clearChat()" title="Clear chat history">Clear</button>
        <div class="connection-status">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">Disconnected</span>
        </div>
      </div>
    </header>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-container">
      <div class="chat-input-wrapper">
        <textarea class="chat-input" id="chat-input" placeholder="Type your message..." rows="1" onkeydown="handleKeyDown(event)"></textarea>
        <button class="send-btn" id="send-btn" onclick="sendMessage()">Send</button>
      </div>
    </div>
  </main>
  <div class="modal-overlay" id="config-modal">
    <div class="modal">
      <h3>MCP Servers Configuration</h3>
      <p style="font-size: 13px; color: #888; margin-bottom: 12px;">Edit your MCP server configuration in JSON format.</p>
      <textarea class="json-editor" id="config-json" placeholder='{"mcpServers": {}}'></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveMCPConfig()">Save</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="example-modal">
    <div class="modal example-modal">
      <h3><span id="example-modal-icon"></span><span id="example-modal-name"></span></h3>
      <div class="example-meta">
        <span id="example-modal-difficulty" class="example-difficulty"></span>
        <span id="example-modal-source"></span>
        <span id="example-modal-endpoint"></span>
      </div>
      <p id="example-modal-description" style="font-size: 13px; color: #aaa; margin-bottom: 16px; line-height: 1.5;"></p>
      <div id="example-modal-steps"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeExampleModal()">Close</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="config-modal-integration">
    <div class="modal config-modal">
      <h3><span id="config-modal-icon"></span><span id="config-modal-name"></span></h3>
      <div id="config-status"></div>
      <div class="config-section">
        <h4>Configuration</h4>
        <div id="config-fields"></div>
      </div>
      <div class="config-section">
        <h4>Event Subscriptions</h4>
        <p style="font-size: 12px; color: #888; margin-bottom: 12px;">Select which events the AI agent should listen for:</p>
        <div id="config-subscriptions"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeConfigModal()">Cancel</button>
        <button class="btn btn-danger" id="disable-integration-btn" onclick="disableCurrentIntegration()" style="display: none;">Disable</button>
        <button class="btn btn-primary" id="save-integration-btn" onclick="saveIntegration()">Enable Integration</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="add-sub-modal">
    <div class="modal">
      <h3>Add Subscription</h3>
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #888; margin-bottom: 4px;">Name *</label>
        <input type="text" id="new-sub-name" placeholder="my-subscription" style="width: 100%; padding: 8px; border: 1px solid #0f3460; border-radius: 4px; background: #1a1a2e; color: #eee;">
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #888; margin-bottom: 4px;">Description</label>
        <input type="text" id="new-sub-description" placeholder="What this subscription does" style="width: 100%; padding: 8px; border: 1px solid #0f3460; border-radius: 4px; background: #1a1a2e; color: #eee;">
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #888; margin-bottom: 4px;">Event Types * (comma separated)</label>
        <input type="text" id="new-sub-events" placeholder="github.push, github.pull_request.*" style="width: 100%; padding: 8px; border: 1px solid #0f3460; border-radius: 4px; background: #1a1a2e; color: #eee;">
      </div>
      <div style="margin-bottom: 16px;">
        <label style="display: block; font-size: 12px; color: #888; margin-bottom: 4px;">AI System Prompt</label>
        <textarea id="new-sub-prompt" placeholder="Instructions for the AI agent when processing events" rows="3" style="width: 100%; padding: 8px; border: 1px solid #0f3460; border-radius: 4px; background: #1a1a2e; color: #eee; resize: vertical;"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeAddSubModal()">Cancel</button>
        <button class="btn btn-primary" onclick="createSubscription()">Create</button>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="subs-json-modal">
    <div class="modal" style="max-width: 700px;">
      <h3>Edit mcpe.json</h3>
      <p style="font-size: 12px; color: #888; margin-bottom: 12px;">Edit the raw JSON configuration. Changes are saved to the server.</p>
      <textarea class="json-editor" id="subs-json-editor" style="height: 400px; font-family: monospace; font-size: 12px;"></textarea>
      <div id="subs-json-error" style="color: #ff5252; font-size: 12px; margin-top: 8px; display: none;"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeSubsJsonModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveSubsJson()">Save</button>
      </div>
    </div>
  </div>
  <script>
    const API_BASE = '';
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.panel + '-panel').classList.add('active');
      });
    });
    async function loadTools() {
      try {
        const res = await fetch(API_BASE + '/api/tools');
        const data = await res.json();
        renderTools(data.tools);
      } catch (err) { console.error('Failed to load tools:', err); }
    }
    async function loadMCPServers() {
      try {
        const res = await fetch(API_BASE + '/api/mcp');
        const data = await res.json();
        renderMCPServers(data.servers);
      } catch (err) { console.error('Failed to load MCP servers:', err); }
    }
    async function loadStatus() {
      try {
        const res = await fetch(API_BASE + '/health');
        const data = await res.json();
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (data.connected) { dot.classList.add('connected'); text.textContent = 'Connected'; }
        else { dot.classList.remove('connected'); text.textContent = 'Disconnected'; }
      } catch (err) { console.error('Failed to load status:', err); }
    }
    function renderTools(tools) {
      const container = document.getElementById('tools-list');
      container.innerHTML = tools.map(tool => '<div class="tool-item"><div class="tool-header"><span class="tool-name">' + tool.name + '</span><span class="tool-source">' + tool.source + '</span></div><div class="tool-description">' + tool.description + '</div><div class="tool-actions"><label class="toggle"><input type="checkbox" ' + (tool.enabled ? 'checked' : '') + ' onchange="toggleTool(\\'' + tool.name + '\\', this.checked)"><span class="toggle-slider"></span></label>' + (tool.source === 'mcp' ? '<button class="btn btn-danger btn-sm" onclick="removeTool(\\'' + tool.name + '\\')">Remove</button>' : '') + '</div></div>').join('');
    }
    function renderMCPServers(servers) {
      const container = document.getElementById('mcp-list');
      if (servers.length === 0) { container.innerHTML = '<p style="color: #666; font-size: 13px; text-align: center; padding: 20px;">No MCP servers configured</p>'; return; }
      container.innerHTML = servers.map(server => '<div class="mcp-item"><div class="mcp-header"><span class="mcp-name">' + server.name + '</span><span class="mcp-status ' + (server.config.enabled ? 'enabled' : 'disabled') + '">' + (server.config.enabled ? 'Enabled' : 'Disabled') + '</span></div><div class="mcp-command">' + server.config.command + ' ' + (server.config.args || []).join(' ') + '</div><div class="tool-actions" style="margin-top: 8px;"><label class="toggle"><input type="checkbox" ' + (server.config.enabled ? 'checked' : '') + ' onchange="toggleMCPServer(\\'' + server.name + '\\', this.checked)"><span class="toggle-slider"></span></label><button class="btn btn-danger btn-sm" onclick="removeMCPServer(\\'' + server.name + '\\')">Remove</button></div></div>').join('');
    }
    async function toggleTool(name, enabled) {
      try { await fetch(API_BASE + '/api/tools/' + name + '/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }); }
      catch (err) { console.error('Failed to toggle tool:', err); loadTools(); }
    }
    async function removeTool(name) {
      if (!confirm('Remove tool "' + name + '"?')) return;
      try { await fetch(API_BASE + '/api/tools/' + name, { method: 'DELETE' }); loadTools(); }
      catch (err) { console.error('Failed to remove tool:', err); }
    }
    async function addTool() {
      const name = document.getElementById('new-tool-name').value.trim();
      const description = document.getElementById('new-tool-description').value.trim();
      if (!name || !description) { alert('Please fill in all fields'); return; }
      try {
        await fetch(API_BASE + '/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
        document.getElementById('new-tool-name').value = '';
        document.getElementById('new-tool-description').value = '';
        loadTools();
      } catch (err) { console.error('Failed to add tool:', err); }
    }
    async function toggleMCPServer(name, enabled) {
      try { await fetch(API_BASE + '/api/mcp/' + name + '/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }); loadMCPServers(); }
      catch (err) { console.error('Failed to toggle MCP server:', err); loadMCPServers(); }
    }
    async function removeMCPServer(name) {
      if (!confirm('Remove MCP server "' + name + '"?')) return;
      try { await fetch(API_BASE + '/api/mcp/' + name, { method: 'DELETE' }); loadMCPServers(); loadTools(); }
      catch (err) { console.error('Failed to remove MCP server:', err); }
    }
    function showMCPJsonModal() { document.getElementById('config-modal').classList.add('active'); loadMCPConfig(); }
    function closeModal() { document.getElementById('config-modal').classList.remove('active'); }
    async function loadMCPConfig() {
      try { const res = await fetch(API_BASE + '/api/mcp/config'); const data = await res.json(); document.getElementById('config-json').value = JSON.stringify(data.config, null, 2); }
      catch (err) { console.error('Failed to load MCP config:', err); }
    }
    async function saveMCPConfig() {
      const json = document.getElementById('config-json').value;
      try {
        const config = JSON.parse(json);
        const res = await fetch(API_BASE + '/api/mcp/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
        const data = await res.json();
        if (data.success) { closeModal(); loadMCPServers(); loadTools(); }
        else { alert('Failed to save: ' + (data.error || 'Unknown error')); }
      } catch (err) { alert('Invalid JSON format'); }
    }
    function handleKeyDown(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }
    async function sendMessage() {
      const input = document.getElementById('chat-input');
      const message = input.value.trim();
      if (!message) return;
      const sendBtn = document.getElementById('send-btn');
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span class="loading"></span>';
      addMessage(message, 'user');
      input.value = '';
      try {
        const res = await fetch(API_BASE + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
        const data = await res.json();
        addMessage(data.message || data.error || 'No response', 'assistant');
        loadStatus();
      } catch (err) { addMessage('Failed to send message: ' + err.message, 'assistant'); }
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
    function addMessage(content, role) {
      const container = document.getElementById('chat-messages');
      const time = new Date().toLocaleTimeString();
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.innerHTML = '<div class="message-content">' + escapeHtml(content) + '</div><div class="message-meta">' + (role === 'user' ? 'You' : 'Agent') + ' · ' + time + '</div>';
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
    function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
    async function loadSubscriptions() {
      try {
        const res = await fetch(API_BASE + '/api/mcpe/subscriptions');
        const data = await res.json();
        renderSubscriptions(data.subscriptions);
        if (data.configPath) {
          document.getElementById('config-path').textContent = data.configPath;
        }
      } catch (err) { console.error('Failed to load subscriptions:', err); }
    }
    async function reloadSubscriptions() {
      try {
        const res = await fetch(API_BASE + '/api/mcpe/subscriptions/reload', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          loadSubscriptions();
          alert('Subscriptions reloaded: ' + data.count + ' active');
        } else {
          alert('Failed to reload: ' + (data.error || 'Unknown error'));
        }
      } catch (err) { alert('Failed to reload subscriptions'); }
    }
    async function refreshEventHistory() {
      try {
        const res = await fetch(API_BASE + '/api/mcpe/events/history');
        const data = await res.json();
        const container = document.getElementById('event-history');
        if (!data.events || data.events.length === 0) {
          container.innerHTML = '<p style="color: #666; text-align: center;">No events yet</p>';
          return;
        }
        container.innerHTML = data.events.map(e => {
          const statusColor = e.matchedSubscriptions > 0 ? '#00d26a' : '#e94560';
          const statusIcon = e.matchedSubscriptions > 0 ? '✓' : '✗';
          const time = new Date(e.receivedAt).toLocaleTimeString();
          return '<div style="padding: 6px 8px; border-bottom: 1px solid #2a2a4e; display: flex; justify-content: space-between; align-items: center;">' +
            '<div><span style="color: ' + statusColor + '; margin-right: 6px;">' + statusIcon + '</span><span style="color: #ccc;">' + e.type + '</span></div>' +
            '<div style="display: flex; gap: 8px; align-items: center;"><span style="color: #888; font-size: 10px;">' + e.matchedSubscriptions + ' matched</span><span style="color: #666; font-size: 10px;">' + time + '</span></div></div>';
        }).join('');
      } catch (err) { console.error('Failed to load event history:', err); }
    }
    function renderSubscriptions(subs) {
      const container = document.getElementById('subs-list');
      if (!subs || subs.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 13px; text-align: center; padding: 20px;">No subscriptions in mcpe.json</p>';
        return;
      }
      container.innerHTML = subs.map(sub => {
        const filters = sub.filter.eventTypes ? sub.filter.eventTypes.join(', ') : (sub.filter.sources ? sub.filter.sources.join(', ') : 'all');
        const cronInfo = sub.delivery && sub.delivery.cronExpression ? '<div style="font-size: 11px; color: #888; margin-top: 4px;">Cron: ' + sub.delivery.cronExpression + '</div>' : '';
        return '<div class="mcp-item"><div class="mcp-header"><span class="mcp-name">' + sub.name + '</span><div style="display: flex; align-items: center; gap: 8px;"><button class="btn-delete" onclick="deleteSubscriptionItem(' + "'" + sub.name + "'" + ')" title="Delete subscription">×</button><label class="toggle"><input type="checkbox" ' + (sub.enabled ? 'checked' : '') + ' onchange="toggleSubscription(' + "'" + sub.name + "'" + ', this.checked)"><span class="toggle-slider"></span></label></div></div><div class="mcp-command" style="color: #e94560;">' + sub.handlerType + '</div><div style="font-size: 12px; color: #888; margin-top: 4px;">Filter: ' + filters + '</div>' + cronInfo + (sub.description ? '<div style="font-size: 11px; color: #666; margin-top: 8px; font-style: italic;">' + sub.description + '</div>' : '') + '</div>';
      }).join('');
    }
    async function toggleSubscription(name, enabled) {
      try {
        await fetch(API_BASE + '/api/mcpe/subscriptions/' + encodeURIComponent(name) + '/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        loadSubscriptions();
      } catch (err) { console.error('Failed to toggle subscription:', err); loadSubscriptions(); }
    }
    async function deleteSubscriptionItem(name) {
      if (!confirm('Delete subscription "' + name + '"? This will remove it from mcpe.json.')) return;
      try {
        const res = await fetch(API_BASE + '/api/mcpe/subscriptions/' + encodeURIComponent(name), {
          method: 'DELETE'
        });
        if (res.ok) {
          loadSubscriptions();
        } else {
          const data = await res.json();
          alert('Failed to delete: ' + (data.error || 'Unknown error'));
        }
      } catch (err) { console.error('Failed to delete subscription:', err); alert('Failed to delete subscription'); }
    }
    async function loadMessages() {
      try {
        const res = await fetch(API_BASE + '/api/messages');
        const data = await res.json();
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        if (data.messages && data.messages.length > 0) {
          data.messages.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString();
            const div = document.createElement('div');
            div.className = 'message ' + msg.role;
            div.innerHTML = '<div class="message-content">' + escapeHtml(msg.content) + '</div><div class="message-meta">' + (msg.role === 'user' ? 'You' : 'Agent') + ' · ' + time + '</div>';
            container.appendChild(div);
          });
          container.scrollTop = container.scrollHeight;
        }
      } catch (err) { console.error('Failed to load messages:', err); }
    }
    async function clearChat() {
      if (!confirm('Clear all chat history?')) return;
      try {
        await fetch(API_BASE + '/api/messages', { method: 'DELETE' });
        document.getElementById('chat-messages').innerHTML = '';
      } catch (err) { console.error('Failed to clear messages:', err); }
    }
    const textarea = document.getElementById('chat-input');
    textarea.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
    let integrationStatuses = {};
    async function loadExamples() {
      try {
        const [exRes, statusRes] = await Promise.all([
          fetch(API_BASE + '/api/examples'),
          fetch(API_BASE + '/api/integrations/status')
        ]);
        const exData = await exRes.json();
        const statusData = await statusRes.json();
        integrationStatuses = statusData.integrations || {};
        renderExamples(exData.examples);
      } catch (err) { console.error('Failed to load examples:', err); }
    }
    function renderExamples(examples) {
      const container = document.getElementById('examples-list');
      if (!examples || examples.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 13px; text-align: center; padding: 20px;">No examples available</p>';
        return;
      }
      container.innerHTML = examples.map(ex => {
        const tags = ex.tags.slice(0, 3).map(t => '<span class="example-tag">' + t + '</span>').join('');
        const isInteractive = ex.interactive;
        const isEnabled = integrationStatuses[ex.id]?.enabled;
        const badge = isInteractive ? (isEnabled ? '<span class="example-badge enabled">Enabled</span>' : '<span class="example-badge">Interactive</span>') : '';
        const cardClass = isInteractive ? 'example-card interactive' : 'example-card';
        const actions = isInteractive
          ? '<div class="example-actions">' +
              '<button class="btn btn-sm ' + (isEnabled ? 'btn-secondary' : 'btn-primary') + '" onclick="event.stopPropagation(); openConfigModal(\\'' + ex.id + '\\')">' + (isEnabled ? 'Configure' : 'Enable') + '</button>' +
              '<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); showExampleModal(\\'' + ex.id + '\\')">Setup Guide</button>' +
            '</div>'
          : '';
        return '<div class="' + cardClass + '" onclick="' + (isInteractive ? 'openConfigModal(\\'' + ex.id + '\\')' : 'showExampleModal(\\'' + ex.id + '\\')') + '">' +
          '<div class="example-header">' +
            '<div class="example-title"><span class="example-icon">' + ex.icon + '</span><span class="example-name">' + ex.name + '</span>' + badge + '</div>' +
            '<span class="example-difficulty ' + ex.difficulty + '">' + ex.difficulty + '</span>' +
          '</div>' +
          '<div class="example-description">' + ex.description.substring(0, 120) + (ex.description.length > 120 ? '...' : '') + '</div>' +
          '<div class="example-tags">' + tags + '</div>' +
          actions +
        '</div>';
      }).join('');
    }
    let currentExamples = [];
    let currentConfigId = null;
    async function showExampleModal(id) {
      if (currentExamples.length === 0) {
        const res = await fetch(API_BASE + '/api/examples');
        const data = await res.json();
        currentExamples = data.examples;
      }
      const ex = currentExamples.find(e => e.id === id);
      if (!ex) return;
      document.getElementById('example-modal-icon').textContent = ex.icon;
      document.getElementById('example-modal-name').textContent = ex.name;
      document.getElementById('example-modal-difficulty').textContent = ex.difficulty;
      document.getElementById('example-modal-difficulty').className = 'example-difficulty ' + ex.difficulty;
      document.getElementById('example-modal-source').textContent = 'Source: ' + ex.source;
      document.getElementById('example-modal-endpoint').textContent = ex.webhookEndpoint ? 'Endpoint: ' + ex.webhookEndpoint : '';
      document.getElementById('example-modal-description').textContent = ex.description;
      const stepsHtml = ex.setupSteps.map(step => {
        const codeBlock = step.code ? '<pre><code>' + escapeHtml(step.code) + '</code></pre>' : '';
        return '<div class="setup-step"><h4>' + step.title + '</h4><p>' + step.description + '</p>' + codeBlock + '</div>';
      }).join('');
      document.getElementById('example-modal-steps').innerHTML = stepsHtml;
      document.getElementById('example-modal').classList.add('active');
    }
    function closeExampleModal() { document.getElementById('example-modal').classList.remove('active'); }
    async function openConfigModal(id) {
      if (currentExamples.length === 0) {
        const res = await fetch(API_BASE + '/api/examples');
        const data = await res.json();
        currentExamples = data.examples;
      }
      const ex = currentExamples.find(e => e.id === id);
      if (!ex || !ex.interactive) return;
      currentConfigId = id;
      const status = integrationStatuses[id];
      const isEnabled = status?.enabled;
      document.getElementById('config-modal-icon').textContent = ex.icon + ' ';
      document.getElementById('config-modal-name').textContent = ex.name;
      document.getElementById('config-status').innerHTML = isEnabled
        ? '<div class="integration-status"><div class="status-indicator"></div><span>Integration is enabled since ' + new Date(status.enabledAt).toLocaleDateString() + '</span></div>'
        : '<div class="integration-status disabled"><div class="status-indicator disabled"></div><span>Integration is not enabled</span></div>';
      const fieldsHtml = (ex.configFields || []).map(f => {
        const value = status?.config?.[f.name] || '';
        if (f.type === 'oauth') {
          const oauthIcons = {
            github: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
            google: '<svg width="20" height="20" viewBox="0 0 24 24" style="margin-right: 8px;"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>'
          };
          const oauthLabels = { github: 'Login with GitHub', google: 'Login with Google' };
          const icon = oauthIcons[f.oauthProvider] || oauthIcons.github;
          const label = oauthLabels[f.oauthProvider] || 'Login';
          return '<div class="config-field">' +
            '<label>' + f.label + (f.required ? ' *' : '') + '</label>' +
            '<div id="oauth-' + f.name + '" class="oauth-field">' +
              '<button class="btn btn-secondary oauth-btn" onclick="startOAuth(' + "'" + f.oauthProvider + "'" + ', ' + "'" + f.name + "'" + ')">' + icon + label + '</button>' +
            '</div>' +
            (f.description ? '<div class="field-desc">' + f.description + '</div>' : '') +
          '</div>';
        }
        // Special handling for defaultRepo field - will be converted to dropdown after OAuth
        if (f.name === 'defaultRepo') {
          return '<div class="config-field">' +
            '<label>' + f.label + (f.required ? ' *' : '') + '</label>' +
            '<div id="repo-selector" class="repo-selector">' +
              '<input type="text" id="config-' + f.name + '" placeholder="' + (f.placeholder || '') + '" value="' + escapeHtml(value) + '" autocomplete="off">' +
              '<div id="repo-dropdown" class="repo-dropdown"></div>' +
            '</div>' +
            (f.description ? '<div class="field-desc">' + f.description + '</div>' : '') +
          '</div>';
        }
        return '<div class="config-field">' +
          '<label>' + f.label + (f.required ? ' *' : '') + '</label>' +
          '<input type="' + (f.type === 'password' ? 'password' : 'text') + '" id="config-' + f.name + '" placeholder="' + (f.placeholder || '') + '" value="' + (f.type === 'password' ? '' : escapeHtml(value)) + '">' +
          (f.description ? '<div class="field-desc">' + f.description + '</div>' : '') +
        '</div>';
      }).join('');
      document.getElementById('config-fields').innerHTML = fieldsHtml;
      // Check OAuth status for OAuth fields
      (ex.configFields || []).filter(f => f.type === 'oauth').forEach(f => {
        checkOAuthStatus(f.oauthProvider, f.name);
      });
      const enabledSubs = status?.enabledSubscriptions || [];
      const subsHtml = (ex.availableSubscriptions || []).map(s => {
        const checked = isEnabled ? enabledSubs.includes(s.id) : s.defaultEnabled;
        return '<label class="sub-checkbox">' +
          '<input type="checkbox" id="sub-' + s.id + '" ' + (checked ? 'checked' : '') + '>' +
          '<div class="sub-info">' +
            '<div class="sub-name">' + s.name + '</div>' +
            '<div class="sub-desc">' + s.description + '</div>' +
            '<div class="sub-events">' + s.eventTypes.join(', ') + '</div>' +
          '</div>' +
        '</label>';
      }).join('');
      document.getElementById('config-subscriptions').innerHTML = subsHtml;
      document.getElementById('disable-integration-btn').style.display = isEnabled ? 'inline-block' : 'none';
      document.getElementById('save-integration-btn').textContent = isEnabled ? 'Save Changes' : 'Enable Integration';
      document.getElementById('config-modal-integration').classList.add('active');
    }
    function closeConfigModal() {
      document.getElementById('config-modal-integration').classList.remove('active');
      currentConfigId = null;
    }
    async function saveIntegration() {
      if (!currentConfigId) return;
      const ex = currentExamples.find(e => e.id === currentConfigId);
      if (!ex) return;
      const config = {};
      (ex.configFields || []).forEach(f => {
        if (f.type === 'oauth') {
          // For OAuth fields, mark as 'oauth' to signal server should use stored token
          if (oauthTokens[f.oauthProvider]) {
            config[f.name] = 'oauth:' + f.oauthProvider;
          }
        } else {
          const el = document.getElementById('config-' + f.name);
          if (el && el.value) config[f.name] = el.value;
        }
      });
      // Check required OAuth fields
      const missingOAuth = (ex.configFields || []).filter(f => f.type === 'oauth' && f.required && !oauthTokens[f.oauthProvider]);
      if (missingOAuth.length > 0) {
        alert('Please connect your ' + missingOAuth[0].oauthProvider + ' account first');
        return;
      }
      const subscriptions = [];
      (ex.availableSubscriptions || []).forEach(s => {
        const el = document.getElementById('sub-' + s.id);
        if (el && el.checked) subscriptions.push(s.id);
      });
      try {
        const res = await fetch(API_BASE + '/api/integrations/' + currentConfigId + '/enable', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config, subscriptions })
        });
        const data = await res.json();
        if (data.success) {
          closeConfigModal();
          loadExamples();
        } else {
          alert('Failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
    async function disableCurrentIntegration() {
      if (!currentConfigId) return;
      if (!confirm('Disable this integration?')) return;
      try {
        const res = await fetch(API_BASE + '/api/integrations/' + currentConfigId + '/disable', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          closeConfigModal();
          loadExamples();
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
    let oauthPopup = null;
    const oauthTokens = {};
    let githubRepos = [];
    let pendingOAuthField = null;
    function startOAuth(provider, fieldName) {
      pendingOAuthField = fieldName;
      const width = 600, height = 700;
      const left = (screen.width - width) / 2;
      const top = (screen.height - height) / 2;
      oauthPopup = window.open(API_BASE + '/auth/' + provider, 'oauth', 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top);
    }
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'github-oauth-success') {
        oauthTokens['github'] = true;
        const user = event.data.user;
        updateOAuthUI('github', 'githubToken', user);
        // Refresh to get repos
        setTimeout(function() { checkOAuthStatus('github', 'githubToken'); }, 500);
      }
      if (event.data && event.data.type === 'google-oauth-success') {
        oauthTokens['google'] = true;
        const user = event.data.user;
        const fieldName = pendingOAuthField || 'googleToken';
        updateOAuthUI('google', fieldName, user);
        setTimeout(function() { checkOAuthStatus('google', fieldName); }, 500);
      }
    });
    async function checkOAuthStatus(provider, fieldName) {
      try {
        const res = await fetch(API_BASE + '/api/oauth/' + provider + '/status');
        const data = await res.json();
        if (data.connected && data.user) {
          oauthTokens[provider] = true;
          updateOAuthUI(provider, fieldName, data.user);
          if (data.repos && data.repos.length > 0) {
            githubRepos = data.repos;
            setupRepoDropdown(data.repos);
          }
        }
      } catch (err) { console.error('Failed to check OAuth status:', err); }
    }
    function setupRepoDropdown(repos) {
      const input = document.getElementById('config-defaultRepo');
      const dropdown = document.getElementById('repo-dropdown');
      if (!input || !dropdown) {
        console.log('[RepoDropdown] Elements not found:', { input: !!input, dropdown: !!dropdown });
        return;
      }
      console.log('[RepoDropdown] Setting up with', repos.length, 'repos');
      // Remove existing listeners by cloning
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      function renderDropdown(filter) {
        const filtered = filter
          ? repos.filter(r => r.full_name.toLowerCase().includes(filter.toLowerCase())).slice(0, 10)
          : repos.slice(0, 10);
        if (filtered.length === 0) {
          dropdown.style.display = 'none';
          return;
        }
        dropdown.innerHTML = filtered.map(r =>
          '<div class="repo-item" data-repo="' + r.full_name + '">' +
            '<span class="repo-name">' + r.full_name + '</span>' +
            (r.private ? '<span class="repo-private">Private</span>' : '') +
          '</div>'
        ).join('');
        dropdown.style.display = 'block';
      }
      newInput.addEventListener('input', function() { renderDropdown(this.value); });
      newInput.addEventListener('focus', function() { renderDropdown(this.value); });
      dropdown.addEventListener('click', function(e) {
        const item = e.target.closest('.repo-item');
        if (item) {
          newInput.value = item.dataset.repo;
          dropdown.style.display = 'none';
        }
      });
      document.addEventListener('click', function(e) {
        if (!e.target.closest('.repo-selector')) dropdown.style.display = 'none';
      });
    }
    function updateOAuthUI(provider, fieldName, user) {
      const container = document.getElementById('oauth-' + fieldName);
      if (container) {
        container.innerHTML = '<div class="oauth-connected">' +
          '<img src="' + user.avatar_url + '" class="oauth-avatar">' +
          '<div class="oauth-user">' +
            '<strong>' + user.name + '</strong>' +
            '<span>@' + user.login + '</span>' +
          '</div>' +
          '<button class="btn btn-sm btn-danger" onclick="disconnectOAuth(' + "'" + provider + "', '" + fieldName + "'" + ')">Disconnect</button>' +
        '</div>';
      }
    }
    async function disconnectOAuth(provider, fieldName) {
      try {
        await fetch(API_BASE + '/api/oauth/' + provider + '/disconnect', { method: 'POST' });
        delete oauthTokens[provider];
        const container = document.getElementById('oauth-' + fieldName);
        if (container) {
          const oauthIcons = {
            github: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
            google: '<svg width="20" height="20" viewBox="0 0 24 24" style="margin-right: 8px;"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>'
          };
          const oauthLabels = { github: 'Login with GitHub', google: 'Login with Google' };
          const icon = oauthIcons[provider] || oauthIcons.github;
          const label = oauthLabels[provider] || 'Login';
          container.innerHTML = '<button class="btn btn-secondary oauth-btn" onclick="startOAuth(' + "'" + provider + "', '" + fieldName + "'" + ')">' + icon + label + '</button>';
        }
      } catch (err) { console.error('Failed to disconnect:', err); }
    }
    function showAddSubModal() {
      document.getElementById('new-sub-name').value = '';
      document.getElementById('new-sub-description').value = '';
      document.getElementById('new-sub-events').value = '';
      document.getElementById('new-sub-prompt').value = '';
      document.getElementById('add-sub-modal').classList.add('active');
    }
    function closeAddSubModal() {
      document.getElementById('add-sub-modal').classList.remove('active');
    }
    async function createSubscription() {
      const name = document.getElementById('new-sub-name').value.trim();
      const description = document.getElementById('new-sub-description').value.trim();
      const eventsStr = document.getElementById('new-sub-events').value.trim();
      const systemPrompt = document.getElementById('new-sub-prompt').value.trim();
      if (!name) { alert('Name is required'); return; }
      if (!eventsStr) { alert('At least one event type is required'); return; }
      const eventTypes = eventsStr.split(',').map(s => s.trim()).filter(s => s);
      try {
        const res = await fetch(API_BASE + '/api/mcpe/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, eventTypes, systemPrompt })
        });
        const data = await res.json();
        if (data.success) {
          closeAddSubModal();
          loadSubscriptions();
        } else {
          alert('Failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
    async function showSubsJsonModal() {
      try {
        const res = await fetch(API_BASE + '/api/mcpe/subscriptions/raw');
        const data = await res.json();
        document.getElementById('subs-json-editor').value = JSON.stringify(data, null, 2);
        document.getElementById('subs-json-error').style.display = 'none';
        document.getElementById('subs-json-modal').classList.add('active');
      } catch (err) {
        alert('Failed to load JSON: ' + err.message);
      }
    }
    function closeSubsJsonModal() {
      document.getElementById('subs-json-modal').classList.remove('active');
    }
    async function saveSubsJson() {
      const editor = document.getElementById('subs-json-editor');
      const errorEl = document.getElementById('subs-json-error');
      try {
        const json = JSON.parse(editor.value);
        errorEl.style.display = 'none';
        const res = await fetch(API_BASE + '/api/mcpe/subscriptions/raw', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json)
        });
        const data = await res.json();
        if (data.success) {
          closeSubsJsonModal();
          loadSubscriptions();
        } else {
          errorEl.textContent = 'Failed: ' + (data.error || 'Unknown error');
          errorEl.style.display = 'block';
        }
      } catch (err) {
        errorEl.textContent = 'Invalid JSON: ' + err.message;
        errorEl.style.display = 'block';
      }
    }
    loadTools(); loadMCPServers(); loadSubscriptions(); loadMessages(); loadExamples(); loadStatus(); refreshEventHistory(); setInterval(loadStatus, 30000); setInterval(refreshEventHistory, 10000);
    // SSE for delayed responses and event notifications
    let evtSource = null;
    function connectSSE() {
      evtSource = new EventSource(API_BASE + '/chat/events');
      evtSource.onopen = function() {
        console.log('[SSE] Connected');
        document.getElementById('status-dot').classList.add('connected');
        document.getElementById('status-text').textContent = 'Live';
      };
      evtSource.onmessage = function(event) {
        console.log('[SSE] Received:', event.data);
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'response') {
            // Check if it's an event notification or delayed response
            const isEventNotification = data.task && data.task.startsWith('Event processed:');
            const header = isEventNotification ? '[Event Notification] ' + data.task : '[Delayed Response]';
            addMessage(header + '\\n\\n' + data.response, 'assistant');
            // Also refresh event history to show the processed event
            refreshEventHistory();
          } else if (data.type === 'connected') {
            console.log('[SSE] Server confirmed connection');
          }
        } catch (err) { console.error('[SSE] Parse error:', err); }
      };
      evtSource.onerror = function(err) {
        console.log('[SSE] Error, reconnecting...', err);
        document.getElementById('status-dot').classList.remove('connected');
        document.getElementById('status-text').textContent = 'Reconnecting...';
        evtSource.close();
        setTimeout(connectSSE, 3000);
      };
    }
    connectSSE();
  </script>
</body>
</html>`;

// Get Fly.io machine ID for sticky sessions
const FLY_MACHINE_ID = process.env.FLY_ALLOC_ID || process.env.FLY_MACHINE_ID || '';

// Create Hono app
export function createApp(): Hono {
  const app = new Hono();

  // Enable CORS
  app.use('*', cors());

  // Sticky sessions middleware - ensures same user hits same machine
  // This is critical for SSE + scheduled tasks to work correctly
  app.use('*', async (c, next) => {
    await next();
    if (FLY_MACHINE_ID && !c.res.headers.get('Set-Cookie')?.includes('fly-force-instance-id')) {
      c.header('Set-Cookie', `fly-force-instance-id=${FLY_MACHINE_ID}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    }
  });

  // Serve the UI at root
  app.get('/', (c) => {
    return c.html(HTML_CONTENT);
  });

  // Health check endpoint
  app.get('/health', (c) => {
    const mcpe = getMCPEInstance();
    return c.json({
      status: 'ok',
      connected: mcpe.isConnected(),
      connectionUrl: mcpe.getConnectionUrl(),
      timestamp: new Date().toISOString(),
    });
  });

  // SSE endpoint for delayed responses
  app.get('/chat/events', (c) => {
    return c.newResponse(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          // Send initial connection message
          controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

          // Register SSE client
          const unsubscribe = addSSEClient((result) => {
            try {
              const data = JSON.stringify({ type: 'response', ...result });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              console.log('[SSE] Sent response to client');
            } catch (err) {
              console.error('[SSE] Failed to send:', err);
            }
          });
          console.log('[SSE] Client connected');

          // Keep connection alive with heartbeat
          const heartbeat = setInterval(() => {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          }, 30000);

          // Cleanup on close
          c.req.raw.signal.addEventListener('abort', () => {
            unsubscribe();
            clearInterval(heartbeat);
          });
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  });

  // ============ Messages API ============

  // Get all messages
  app.get('/api/messages', (c) => {
    const messages = loadMessages();
    return c.json({ messages });
  });

  // Clear all messages
  app.delete('/api/messages', (c) => {
    clearMessages();
    return c.json({ success: true });
  });

  // ============ Tools API ============

  // List all tools
  app.get('/api/tools', (c) => {
    const tools = getAllTools();
    return c.json({ tools });
  });

  // Add custom tool
  app.post('/api/tools', async (c) => {
    try {
      const body = await c.req.json();
      const { name, description } = body as { name?: string; description?: string };

      if (!name || !description) {
        return c.json({ success: false, error: 'Name and description required' }, 400);
      }

      addCustomTool({ name, description, enabled: true });
      return c.json({ success: true });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Toggle tool enabled state
  app.post('/api/tools/:name/toggle', async (c) => {
    try {
      const name = c.req.param('name');
      const body = await c.req.json();
      const { enabled } = body as { enabled?: boolean };

      if (typeof enabled !== 'boolean') {
        return c.json({ success: false, error: 'Enabled must be a boolean' }, 400);
      }

      const success = setToolEnabled(name, enabled);
      return c.json({ success });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Remove custom tool
  app.delete('/api/tools/:name', (c) => {
    const name = c.req.param('name');
    const success = removeCustomTool(name);
    return c.json({ success });
  });

  // ============ MCPE Subscriptions API ============

  // Get mcpe.json subscriptions
  app.get('/api/mcpe/subscriptions', (c) => {
    const data = getSubscriptionsJSON();
    return c.json(data);
  });

  // Get mcpe.json config path
  app.get('/api/mcpe/config-path', (c) => {
    return c.json({ path: getConfigPath() });
  });

  // Get raw mcpe.json for editing
  app.get('/api/mcpe/subscriptions/raw', (c) => {
    return c.json(getRawConfig());
  });

  // Save raw mcpe.json
  app.put('/api/mcpe/subscriptions/raw', async (c) => {
    try {
      const body = await c.req.json();
      const result = setRawConfig(body);
      return c.json(result, result.success ? 200 : 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Toggle subscription enabled state
  app.post('/api/mcpe/subscriptions/:name/toggle', async (c) => {
    try {
      const name = c.req.param('name');
      const body = await c.req.json();
      const { enabled } = body as { enabled?: boolean };

      if (typeof enabled !== 'boolean') {
        return c.json({ success: false, error: 'Enabled must be a boolean' }, 400);
      }

      const success = setSubscriptionEnabled(name, enabled);
      return c.json({ success, name, enabled });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Delete subscription
  app.delete('/api/mcpe/subscriptions/:name', (c) => {
    const name = c.req.param('name');
    const success = deleteSubscription(name);
    if (success) {
      return c.json({ success: true, message: `Deleted subscription: ${name}` });
    }
    return c.json({ success: false, error: 'Subscription not found' }, 404);
  });

  // Create subscription
  app.post('/api/mcpe/subscriptions', async (c) => {
    try {
      const body = await c.req.json();
      const { name, description, eventTypes, systemPrompt } = body as {
        name?: string;
        description?: string;
        eventTypes?: string[];
        systemPrompt?: string;
      };

      if (!name || !eventTypes || eventTypes.length === 0) {
        return c.json({ success: false, error: 'Name and eventTypes are required' }, 400);
      }

      const result = addSubscription({
        name,
        description,
        eventTypes,
        systemPrompt,
      });

      if (result.success) {
        // Reload subscriptions in events server
        reloadEventSubscriptions();
        return c.json({ success: true, message: `Created subscription: ${name}` });
      }
      return c.json({ success: false, error: result.error }, 400);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Reload subscriptions from mcpe.json
  app.post('/api/mcpe/subscriptions/reload', (c) => {
    try {
      reloadEventSubscriptions();
      const subs = getSubscriptionsJSON();
      return c.json({
        success: true,
        count: subs.subscriptions.filter(s => s.enabled).length,
        message: 'Subscriptions reloaded'
      });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Get recent event history (for debugging)
  app.get('/api/mcpe/events/history', (c) => {
    const history = getEventHistory();
    return c.json({ events: history });
  });

  // ============ MCP Servers API ============

  // List MCP servers
  app.get('/api/mcp', (c) => {
    const servers = listMCPServers();
    return c.json({ servers });
  });

  // Add MCP server
  app.post('/api/mcp', async (c) => {
    try {
      const body = await c.req.json();
      const { name, command, args, env } = body as {
        name?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
      };

      if (!name || !command) {
        return c.json({ success: false, error: 'Name and command required' }, 400);
      }

      addMCPServer(name, { command, args, env, enabled: true });
      return c.json({ success: true });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Toggle MCP server
  app.post('/api/mcp/:name/toggle', async (c) => {
    try {
      const name = c.req.param('name');
      const body = await c.req.json();
      const { enabled } = body as { enabled?: boolean };

      if (typeof enabled !== 'boolean') {
        return c.json({ success: false, error: 'Enabled must be a boolean' }, 400);
      }

      const success = enableMCPServer(name, enabled);
      return c.json({ success });
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // Remove MCP server
  app.delete('/api/mcp/:name', (c) => {
    const name = c.req.param('name');
    const success = removeMCPServer(name);
    return c.json({ success });
  });

  // Export MCP config
  app.get('/api/mcp/config', (c) => {
    const config = exportMCPConfig();
    return c.json({ config });
  });

  // Import MCP config
  app.post('/api/mcp/config', async (c) => {
    try {
      const body = await c.req.json();
      const result = importMCPConfig(body);
      return c.json(result);
    } catch (error) {
      return c.json({ success: false, error: String(error) }, 500);
    }
  });

  // ============ Original Endpoints ============

  // Register endpoint - request agent to subscribe to events
  app.post('/register', async (c) => {
    try {
      const body = await c.req.json();
      const parseResult = RegisterRequestSchema.safeParse(body);

      if (!parseResult.success) {
        return c.json(
          {
            success: false,
            error: 'Invalid request',
            details: parseResult.error.errors,
          },
          400
        );
      }

      const request: RegisterRequest = parseResult.data;

      // Build the user message for the agent
      let userMessage: string;
      if (request.prompt) {
        userMessage = request.prompt;
      } else if (request.filter) {
        const parts: string[] = ['Subscribe to events'];
        if (request.filter.sources?.length) {
          parts.push(`from ${request.filter.sources.join(', ')}`);
        }
        if (request.filter.eventTypes?.length) {
          parts.push(`with types: ${request.filter.eventTypes.join(', ')}`);
        }
        if (request.filter.tags?.length) {
          parts.push(`tagged: ${request.filter.tags.join(', ')}`);
        }
        if (request.filter.priority?.length) {
          parts.push(`priority: ${request.filter.priority.join(', ')}`);
        }
        userMessage = parts.join(' ');
      } else {
        userMessage = 'Subscribe to all available events';
      }

      const result = await runAgent({
        userMessage,
        mcpeUrl: request.mcpeUrl,
      });

      if (result.success) {
        return c.json({
          success: true,
          subscriptionId: result.subscriptionId,
          agentDecision: result.message,
          subscriptionInfo: result.subscriptionInfo,
        });
      } else {
        return c.json(
          {
            success: false,
            error: result.error,
            agentDecision: result.message,
          },
          500
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // List subscriptions endpoint
  app.get('/subscriptions', async (c) => {
    try {
      const mcpe = getMCPEInstance();
      const subscriptions = await mcpe.listSubscriptions();

      return c.json({
        success: true,
        connected: mcpe.isConnected(),
        subscriptions: subscriptions.map((s) => ({
          id: s.id,
          filter: s.filter,
          eventCount: s.eventCount,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // Unsubscribe endpoint
  app.delete('/subscriptions/:id', async (c) => {
    try {
      const subscriptionId = c.req.param('id');
      const mcpe = getMCPEInstance();

      if (!mcpe.isConnected()) {
        return c.json(
          {
            success: false,
            error: 'Not connected to MCPE EventHub',
          },
          400
        );
      }

      const success = await mcpe.unsubscribe(subscriptionId);

      return c.json({
        success,
        subscriptionId,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // Agent chat endpoint - more flexible interaction
  app.post('/chat', async (c) => {
    try {
      const body = await c.req.json();
      const { message, mcpeUrl } = body as { message?: string; mcpeUrl?: string };

      if (!message) {
        return c.json(
          {
            success: false,
            error: 'Message is required',
          },
          400
        );
      }

      // Save user message
      addMessage('user', message);

      // Load conversation history for context
      const messages = loadMessages();

      const result = await runAgent({
        userMessage: message,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        mcpeUrl,
      });

      // Save assistant response
      addMessage('assistant', result.message);

      return c.json({
        success: result.success,
        message: result.message,
        subscriptionId: result.subscriptionId,
        error: result.error,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          error: errorMessage,
        },
        500
      );
    }
  });

  // ============ Events Demo API ============

  // Demo UI page
  app.get('/demo', (c) => {
    const info = getDemoInfo();

    // Generate subscriptions HTML
    const subscriptionsHtml = info.subscriptions.map(s => {
      const name = s.filter.eventTypes ? s.filter.eventTypes.join(', ') : s.filter.sources?.join(', ') || 'All events';
      const agentConfig = s.handlerType === 'agent' && s.handlerConfig
        ? `<div class="sub-config"><strong>Agent Config:</strong><br>Model: ${s.handlerConfig.model || 'gpt-4o-mini'}<br>Prompt: "${s.handlerConfig.systemPrompt}"</div>`
        : '';
      return `<div class="subscription">
        <div class="sub-header">
          <span class="sub-name">${name}</span>
          <span class="sub-type ${s.handlerType}">${s.handlerType}</span>
        </div>
        <div class="sub-filter">filter: ${JSON.stringify(s.filter)}</div>
        ${agentConfig}
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCPE Demo - Event Handlers</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #eee; min-height: 100vh; padding: 24px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #fff; }
    .subtitle { color: #888; margin-bottom: 32px; font-size: 16px; }
    .ntfy-banner { background: linear-gradient(135deg, #e94560 0%, #ff6b6b 100%); border-radius: 12px; padding: 20px 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    .ntfy-banner h2 { font-size: 18px; margin-bottom: 4px; }
    .ntfy-banner p { font-size: 14px; opacity: 0.9; }
    .ntfy-banner a { background: rgba(255,255,255,0.2); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; transition: background 0.2s; }
    .ntfy-banner a:hover { background: rgba(255,255,255,0.3); }
    .section { background: #16213e; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid #0f3460; }
    .section h3 { font-size: 16px; color: #e94560; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .subscription { background: #1a1a2e; border-radius: 8px; padding: 16px; margin-bottom: 12px; border: 1px solid #0f3460; }
    .subscription:last-child { margin-bottom: 0; }
    .sub-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .sub-name { font-weight: 600; font-size: 15px; }
    .sub-type { font-size: 12px; padding: 4px 10px; border-radius: 20px; font-weight: 500; }
    .sub-type.webhook { background: rgba(0, 200, 83, 0.2); color: #00c853; }
    .sub-type.agent { background: rgba(233, 69, 96, 0.2); color: #e94560; }
    .sub-filter { font-size: 13px; color: #888; margin-bottom: 12px; font-family: monospace; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 6px; }
    .sub-config { font-size: 13px; color: #aaa; padding: 12px; background: rgba(233, 69, 96, 0.1); border-radius: 6px; border-left: 3px solid #e94560; margin-top: 8px; }
    .sub-config strong { color: #e94560; }
    .trigger-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 24px; }
    .trigger-btn { padding: 16px 20px; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; text-align: left; }
    .trigger-btn .emoji { font-size: 24px; margin-bottom: 8px; display: block; }
    .trigger-btn .label { display: block; margin-bottom: 4px; }
    .trigger-btn .desc { font-size: 12px; font-weight: 400; opacity: 0.8; }
    .trigger-btn.github { background: #238636; color: white; }
    .trigger-btn.github:hover { background: #2ea043; }
    .trigger-btn.slack { background: #4A154B; color: white; }
    .trigger-btn.slack:hover { background: #611f69; }
    .trigger-btn.error { background: #d93025; color: white; }
    .trigger-btn.error:hover { background: #ea4335; }
    .trigger-btn.analyze { background: #1a73e8; color: white; }
    .trigger-btn.analyze:hover { background: #4285f4; }
    .trigger-btn.alert { background: #f9ab00; color: #1a1a2e; }
    .trigger-btn.alert:hover { background: #ffc107; }
    .result { margin-top: 16px; padding: 16px; background: #1a1a2e; border-radius: 8px; font-family: monospace; font-size: 13px; display: none; white-space: pre-wrap; word-break: break-all; }
    .result.show { display: block; }
    .result.success { border-left: 3px solid #00c853; }
    .result.error { border-left: 3px solid #d93025; }
    .mcpe-config { background: #0d1117; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 12px; overflow-x: auto; color: #c9d1d9; white-space: pre; }
    .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #0f3460; color: #666; font-size: 13px; }
    .footer a { color: #e94560; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>MCPE Events Demo</h1>
    <p class="subtitle">MCP Events with webhook and AI agent handlers</p>

    <div class="ntfy-banner">
      <div>
        <h2>Watch Events Live</h2>
        <p>Open ntfy.sh to see events and agent responses in real-time</p>
      </div>
      <a href="https://ntfy.sh/${info.ntfyTopic}" target="_blank">Open ntfy.sh/${info.ntfyTopic}</a>
    </div>

    <div class="section">
      <h3>Trigger Events</h3>
      <p style="color: #888; font-size: 14px; margin-bottom: 16px;">Click a button to publish an event. Watch the results appear in ntfy.sh!</p>
      <div class="trigger-section">
        <button class="trigger-btn github" onclick="trigger('github')">
          <span class="emoji">GitHub</span>
          <span class="label">GitHub Push</span>
          <span class="desc">Sends to webhook handler</span>
        </button>
        <button class="trigger-btn slack" onclick="trigger('slack')">
          <span class="emoji">Slack</span>
          <span class="label">Slack Message</span>
          <span class="desc">Sends to webhook handler</span>
        </button>
        <button class="trigger-btn error" onclick="trigger('error')">
          <span class="emoji">AI</span>
          <span class="label">Error Event</span>
          <span class="desc">AI agent analyzes the error</span>
        </button>
        <button class="trigger-btn analyze" onclick="trigger('analyze')">
          <span class="emoji">Data</span>
          <span class="label">Analyze Data</span>
          <span class="desc">AI agent extracts insights</span>
        </button>
        <button class="trigger-btn alert" onclick="trigger('alert')">
          <span class="emoji">Alert</span>
          <span class="label">High Priority Alert</span>
          <span class="desc">Urgent notification</span>
        </button>
      </div>
      <div id="result" class="result"></div>
    </div>

    <div class="section">
      <h3>Registered Subscriptions (mcpe.json)</h3>
      ${subscriptionsHtml}
    </div>

    <div class="section">
      <h3>Example mcpe.json Configuration</h3>
      <div class="mcpe-config">{
  "version": "1.0",
  "subscriptions": [
    {
      "name": "error-analyzer",
      "filter": { "eventTypes": ["error.*", "*.failed"] },
      "handler": {
        "type": "agent",
        "model": "gpt-4o-mini",
        "systemPrompt": "Analyze this error and suggest fixes...",
        "maxTokens": 300
      }
    },
    {
      "name": "slack-to-ntfy",
      "filter": { "sources": ["slack"] },
      "handler": {
        "type": "webhook",
        "url": "https://ntfy.sh/my-topic"
      }
    }
  ]
}</div>
    </div>

    <div class="footer">
      <p>MCPE - MCP Events Extension | <a href="https://github.com/mendyEdri/mcp-events">GitHub</a></p>
    </div>
  </div>

  <script>
    async function trigger(type) {
      const result = document.getElementById('result');
      result.className = 'result show';
      result.textContent = 'Publishing event...';

      try {
        const res = await fetch('/publish/' + type, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await res.json();
        result.className = 'result show ' + (data.success ? 'success' : 'error');
        result.textContent = JSON.stringify(data, null, 2);

        if (data.success && (type === 'error' || type === 'analyze')) {
          result.textContent += '\\n\\nAgent is processing... Check ntfy.sh for the AI response!';
        }
      } catch (err) {
        result.className = 'result show error';
        result.textContent = 'Error: ' + err.message;
      }
    }
  </script>
</body>
</html>`;
    return c.html(html);
  });

  // Get demo info as JSON
  app.get('/demo/info', (c) => {
    const info = getDemoInfo();
    return c.json({
      success: true,
      ...info,
      usage: {
        publish: 'POST /publish with { type, source, data, priority? }',
        quickPublish: 'POST /publish/github, /publish/slack, /publish/alert, /publish/error, /publish/analyze',
        subscribe: `Open ${info.subscribeUrl} in browser or run: curl -s ${info.ntfyUrl}/json`,
      },
    });
  });

  // Publish a custom event
  app.post('/publish', async (c) => {
    try {
      const body = await c.req.json();
      const { type, source, data, priority, tags } = body as {
        type: string;
        source?: 'github' | 'gmail' | 'slack' | 'custom';
        data?: Record<string, unknown>;
        priority?: 'low' | 'normal' | 'high' | 'critical';
        tags?: string[];
      };

      if (!type) {
        return c.json({ success: false, error: 'type is required' }, 400);
      }

      const event = createEvent(
        type,
        data || {},
        {
          source: source || 'custom',
          priority: priority || 'normal',
          tags,
        }
      );

      const result = await publishEvent(event);

      return c.json({
        success: true,
        event: {
          id: event.id,
          type: event.type,
          source: event.metadata.source,
        },
        matchedSubscriptions: result.matchedSubscriptions,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Quick publish: GitHub event
  app.post('/publish/github', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { subtype, data } = body as { subtype?: string; data?: Record<string, unknown> };

      const event = createSampleEvent('github', subtype);
      if (data) {
        Object.assign(event.data, data);
      }

      const result = await publishEvent(event);

      return c.json({
        success: true,
        event: { id: event.id, type: event.type },
        matchedSubscriptions: result.matchedSubscriptions,
        message: 'GitHub event published! Check ntfy.sh for notifications.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Quick publish: Slack event
  app.post('/publish/slack', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { message, channel } = body as { message?: string; channel?: string };

      const event = createSampleEvent('slack', 'slack.message.posted');
      event.data.text = message || 'Hello from MCPE demo!';
      event.data.channel = channel || '#general';

      const result = await publishEvent(event);

      return c.json({
        success: true,
        event: { id: event.id, type: event.type },
        matchedSubscriptions: result.matchedSubscriptions,
        message: 'Slack event published! Check ntfy.sh for notifications.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Quick publish: Alert (high priority)
  app.post('/publish/alert', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { title, message, priority } = body as {
        title?: string;
        message?: string;
        priority?: 'high' | 'critical';
      };

      const event = createAlertEvent(
        title || 'Demo Alert',
        message || 'This is a test alert from MCPE',
        priority || 'high'
      );

      const result = await publishEvent(event);

      return c.json({
        success: true,
        event: { id: event.id, type: event.type, priority: event.metadata.priority },
        matchedSubscriptions: result.matchedSubscriptions,
        message: 'Alert published! Check ntfy.sh for notifications.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // List demo subscriptions
  app.get('/demo/subscriptions', (c) => {
    const server = getEventsServer();
    const subscriptions = server.subscriptionManager.listByClient('demo');

    return c.json({
      success: true,
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        status: s.status,
        filter: s.filter,
        handler: s.handler ? { type: s.handler.type } : undefined,
      })),
    });
  });

  // Quick publish: Error event (triggers agent handler)
  app.post('/publish/error', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { errorType, errorMessage, context } = body as {
        errorType?: string;
        errorMessage?: string;
        context?: Record<string, unknown>;
      };

      const event = createErrorEvent(
        errorType || 'application',
        errorMessage || 'An unexpected error occurred',
        context || { stack: 'Error: Something went wrong\n    at processRequest (/app/server.js:42)' }
      );

      const result = await publishEvent(event);

      return c.json({
        success: true,
        event: { id: event.id, type: event.type, priority: event.metadata.priority },
        matchedSubscriptions: result.matchedSubscriptions,
        message: 'Error event published! The agent will analyze it and send results to ntfy.sh.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Quick publish: Analyze event (triggers agent handler)
  app.post('/publish/analyze', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { subject, data } = body as {
        subject?: string;
        data?: Record<string, unknown>;
      };

      const event = createAnalyzeEvent(
        subject || 'Sample Data Analysis',
        data || {
          metrics: {
            users: 1250,
            sessions: 4320,
            bounceRate: 0.42,
            avgSessionDuration: 185,
          },
          trends: {
            usersChange: '+12%',
            sessionsChange: '+8%',
            bounceRateChange: '-3%',
          },
          period: 'last 7 days',
        }
      );

      const result = await publishEvent(event);

      return c.json({
        success: true,
        event: { id: event.id, type: event.type },
        matchedSubscriptions: result.matchedSubscriptions,
        message: 'Analyze event published! The agent will process it and send insights to ntfy.sh.',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // ============ Examples API ============

  // List all examples
  app.get('/api/examples', (c) => {
    const examples = getExamples();
    return c.json({ examples });
  });

  // Get example by ID
  app.get('/api/examples/:id', (c) => {
    const id = c.req.param('id');
    const example = getExampleById(id);
    if (!example) {
      return c.json({ success: false, error: 'Example not found' }, 404);
    }
    return c.json({ example });
  });

  // ============ Integrations API ============

  // Get all integration statuses
  app.get('/api/integrations/status', (c) => {
    const integrations = getAllIntegrationStatuses();
    return c.json({ integrations });
  });

  // Get single integration status
  app.get('/api/integrations/:id/status', (c) => {
    const id = c.req.param('id');
    const status = getIntegrationStatus(id);
    return c.json({ status: status || null });
  });

  // Enable an integration
  app.post('/api/integrations/:id/enable', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      let { config, subscriptions } = body as {
        config: Record<string, string>;
        subscriptions: string[];
      };

      // Replace OAuth placeholders with actual tokens
      const resolvedConfig = { ...config };
      for (const [key, value] of Object.entries(config || {})) {
        if (typeof value === 'string' && value.startsWith('oauth:')) {
          const provider = value.replace('oauth:', '');
          const token = getPendingOAuthToken(provider);
          if (token) {
            resolvedConfig[key] = token;
            console.log(`[Integration] Using OAuth token for ${provider}`);
          } else {
            return c.json({ success: false, error: `No ${provider} OAuth token found. Please login first.` }, 400);
          }
        }
      }

      const result = enableIntegration(id, resolvedConfig || {}, subscriptions || []);

      if (result.success) {
        // If this is GitHub integration, we could also add MCP server config here
        const example = getExampleById(id);
        if (example && id === 'mcpe-github') {
          console.log('[Integration] GitHub integration enabled, token configured');
          // The token is now available via getGitHubToken() for use in handlers
        }
      }

      return c.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Disable an integration
  app.post('/api/integrations/:id/disable', (c) => {
    const id = c.req.param('id');
    const result = disableIntegration(id);
    return c.json(result);
  });

  // Update integration subscriptions
  app.post('/api/integrations/:id/subscriptions', async (c) => {
    try {
      const id = c.req.param('id');
      const body = await c.req.json();
      const { subscriptions } = body as { subscriptions: string[] };

      const result = updateIntegrationSubscriptions(id, subscriptions || []);
      return c.json(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // ============ GitHub OAuth ============

  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  // Start GitHub OAuth flow
  app.get('/auth/github', (c) => {
    if (!GITHUB_CLIENT_ID) {
      return c.text('GitHub OAuth not configured (missing GITHUB_CLIENT_ID)', 500);
    }
    // Use X-Forwarded-Proto header or default to https for production
    const proto = c.req.header('x-forwarded-proto') || 'https';
    const host = c.req.header('host') || 'mcpe-agent-server.fly.dev';
    const redirectUri = `${proto}://${host}/auth/github/callback`;
    const scope = 'repo read:user';
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;
    return c.redirect(authUrl);
  });

  // GitHub OAuth callback
  app.get('/auth/github/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) {
      return c.text('Missing authorization code', 400);
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return c.text('GitHub OAuth not configured', 500);
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };

      if (tokenData.error || !tokenData.access_token) {
        console.error('[OAuth] Token exchange failed:', tokenData);
        return c.text('Failed to get access token: ' + (tokenData.error || 'unknown error'), 400);
      }

      // Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'MCPE-Agent-Server',
        },
      });

      const userData = await userResponse.json() as { login: string; avatar_url: string; name: string };

      // Store token and user info
      setPendingOAuthToken('github', tokenData.access_token);
      setOAuthUserInfo('github', {
        login: userData.login,
        avatar_url: userData.avatar_url,
        name: userData.name || userData.login,
      });

      // Fetch user's repositories
      try {
        const reposResponse = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'MCPE-Agent-Server',
          },
        });
        const reposData = await reposResponse.json() as Array<{ full_name: string; description: string; private: boolean }>;
        setOAuthRepos('github', reposData.map(r => ({
          full_name: r.full_name,
          description: r.description || '',
          private: r.private,
        })));
        console.log(`[OAuth] Fetched ${reposData.length} repos for ${userData.login}`);
      } catch (repoErr) {
        console.error('[OAuth] Failed to fetch repos:', repoErr);
      }

      console.log(`[OAuth] GitHub auth successful for ${userData.login}`);

      // Redirect back to the app with success
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head><title>GitHub Connected</title></head>
        <body style="background: #1a1a2e; color: #eee; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
          <div style="text-align: center;">
            <h2>✅ GitHub Connected!</h2>
            <p>Logged in as <strong>${userData.login}</strong></p>
            <p>You can close this window and return to the app.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'github-oauth-success', user: ${JSON.stringify(userData)} }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('[OAuth] Error:', error);
      return c.text('OAuth error: ' + String(error), 500);
    }
  });

  // Get OAuth status
  app.get('/api/oauth/:provider/status', (c) => {
    const provider = c.req.param('provider');
    const token = getPendingOAuthToken(provider);
    const userInfo = getOAuthUserInfo(provider);
    const repos = getOAuthRepos(provider);

    return c.json({
      connected: !!token,
      user: userInfo || null,
      repos: repos || [],
    });
  });

  // Clear OAuth token
  app.post('/api/oauth/:provider/disconnect', (c) => {
    const provider = c.req.param('provider');
    clearPendingOAuthToken(provider);
    return c.json({ success: true });
  });

  // ============ Google OAuth ============

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  // Start Google OAuth flow
  app.get('/auth/google', (c) => {
    if (!GOOGLE_CLIENT_ID) {
      return c.text('Google OAuth not configured (missing GOOGLE_CLIENT_ID)', 500);
    }
    const proto = c.req.header('x-forwarded-proto') || 'https';
    const host = c.req.header('host') || 'mcpe-agent-server.fly.dev';
    const redirectUri = `${proto}://${host}/auth/google/callback`;
    // Scopes for Gmail, Calendar, and Drive read access
    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
    return c.redirect(authUrl);
  });

  // Google OAuth callback
  app.get('/auth/google/callback', async (c) => {
    const code = c.req.query('code');
    if (!code) {
      return c.text('Missing authorization code', 400);
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return c.text('Google OAuth not configured', 500);
    }

    try {
      const proto = c.req.header('x-forwarded-proto') || 'https';
      const host = c.req.header('host') || 'mcpe-agent-server.fly.dev';
      const redirectUri = `${proto}://${host}/auth/google/callback`;

      // Exchange code for access token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token: string; refresh_token?: string; error?: string };

      if (tokenData.error || !tokenData.access_token) {
        console.error('[OAuth] Google token error:', tokenData);
        return c.text('Failed to get access token: ' + (tokenData.error || 'Unknown error'), 400);
      }

      // Fetch user info
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      });

      const userData = await userResponse.json() as { id: string; email: string; name: string; picture: string };

      // Store the token
      setPendingOAuthToken('google', tokenData.access_token);
      setOAuthUserInfo('google', {
        login: userData.email,
        avatar_url: userData.picture || '',
        name: userData.name || userData.email,
      });

      console.log(`[OAuth] Google auth successful for ${userData.email}`);

      // Start Gmail watch for push notifications
      const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'mcpe-example';
      const GMAIL_PUBSUB_TOPIC = process.env.GMAIL_PUBSUB_TOPIC || 'gmail-notifications';

      try {
        const watchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topicName: `projects/${GOOGLE_CLOUD_PROJECT}/topics/${GMAIL_PUBSUB_TOPIC}`,
            labelIds: ['INBOX'],
            labelFilterBehavior: 'INCLUDE',
          }),
        });

        const watchData = await watchResponse.json() as { historyId?: string; expiration?: string; error?: { message: string } };

        if (watchData.error) {
          console.error('[Gmail Watch] Error:', watchData.error);
        } else {
          console.log(`[Gmail Watch] Started for ${userData.email}, historyId: ${watchData.historyId}, expires: ${watchData.expiration}`);
        }
      } catch (watchError) {
        console.error('[Gmail Watch] Failed to start:', watchError);
        // Don't fail the OAuth flow if watch fails
      }

      // Redirect back to the app with success
      return c.html(`
        <!DOCTYPE html>
        <html>
        <head><title>Google Connected</title></head>
        <body style="background: #1a1a2e; color: #eee; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
          <div style="text-align: center;">
            <h2>✅ Google Connected!</h2>
            <p>Logged in as <strong>${userData.email}</strong></p>
            <p>You can close this window and return to the app.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'google-oauth-success', user: ${JSON.stringify({ login: userData.email, avatar_url: userData.picture || '', name: userData.name || userData.email })} }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('[OAuth] Google error:', error);
      return c.text('OAuth error: ' + String(error), 500);
    }
  });

  // ============ Webhook Endpoints ============

  // GitHub webhook endpoint
  app.post('/webhook/github', async (c) => {
    try {
      const rawBody = await c.req.text();
      const eventType = c.req.header('X-GitHub-Event');
      const signature = c.req.header('X-Hub-Signature-256');

      console.log(`[Webhook] GitHub ${eventType} event received`);

      const result = processGitHubWebhook(rawBody, eventType, signature);

      if (!result.success) {
        console.error(`[Webhook] GitHub webhook failed: ${result.error}`);
        return c.json({ success: false, error: result.error }, 400);
      }

      // If it's a ping event, just acknowledge it
      if (result.eventType === 'ping') {
        console.log('[Webhook] GitHub ping received');
        return c.json({ success: true, message: 'Pong!' });
      }

      // Publish the event to trigger subscription handlers (mcpe.json)
      // The handlers will process events using their configured systemPrompt
      // and send results to the chat via SSE
      if (result.event) {
        const publishResult = await publishEvent(result.event);
        console.log(`[Webhook] Published ${result.eventType}, matched ${publishResult.matchedSubscriptions} subscriptions`);

        return c.json({
          success: true,
          event: {
            id: result.event.id,
            type: result.event.type,
          },
          matchedSubscriptions: publishResult.matchedSubscriptions,
        });
      }

      return c.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Webhook] GitHub webhook error: ${errorMessage}`);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Google Workspace webhook endpoint (Gmail, Calendar, Drive via Pub/Sub)
  app.post('/webhook/google', async (c) => {
    try {
      const body = await c.req.json();
      const service = (c.req.query('service') || 'gmail') as 'gmail' | 'calendar' | 'drive';

      console.log(`[Webhook] Google ${service} event received`);

      const result = processGoogleWebhook(body, service);

      if (!result.success) {
        console.error(`[Webhook] Google webhook failed: ${result.error}`);
        return c.json({ success: false, error: result.error }, 400);
      }

      // For Gmail, try to fetch actual email content
      if (result.event && service === 'gmail') {
        const googleToken = getGoogleToken();
        if (googleToken) {
          try {
            // Fetch recent messages
            const messagesResponse = await fetch(
              'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=1&labelIds=INBOX',
              {
                headers: { 'Authorization': `Bearer ${googleToken}` },
              }
            );
            const messagesData = await messagesResponse.json() as { messages?: Array<{ id: string }> };

            if (messagesData.messages && messagesData.messages.length > 0) {
              const messageId = messagesData.messages[0].id;

              // Fetch the actual message
              const messageResponse = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
                {
                  headers: { 'Authorization': `Bearer ${googleToken}` },
                }
              );
              const messageData = await messageResponse.json() as {
                id: string;
                snippet: string;
                payload?: {
                  headers?: Array<{ name: string; value: string }>;
                  body?: { data?: string };
                  parts?: Array<{ mimeType: string; body?: { data?: string } }>;
                };
              };

              // Extract email details
              const headers = messageData.payload?.headers || [];
              const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
              const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
              const date = headers.find(h => h.name === 'Date')?.value || '';

              // Get body content
              let bodyContent = messageData.snippet || '';
              if (messageData.payload?.body?.data) {
                bodyContent = Buffer.from(messageData.payload.body.data, 'base64').toString('utf-8');
              } else if (messageData.payload?.parts) {
                const textPart = messageData.payload.parts.find(p => p.mimeType === 'text/plain');
                if (textPart?.body?.data) {
                  bodyContent = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
                }
              }

              // Enhance the event with email content
              result.event.data = {
                ...result.event.data,
                email: {
                  id: messageId,
                  from,
                  subject,
                  date,
                  snippet: messageData.snippet,
                  body: bodyContent.substring(0, 2000), // Limit body size
                },
              };

              console.log(`[Webhook] Fetched email: "${subject}" from ${from}`);
            }
          } catch (emailError) {
            console.error('[Webhook] Failed to fetch email content:', emailError);
            // Continue without email content
          }
        }
      }

      // Publish the event to trigger subscription handlers
      if (result.event) {
        const publishResult = await publishEvent(result.event);
        console.log(`[Webhook] Published ${result.eventType}, matched ${publishResult.matchedSubscriptions} subscriptions`);

        return c.json({
          success: true,
          event: {
            id: result.event.id,
            type: result.event.type,
          },
          matchedSubscriptions: publishResult.matchedSubscriptions,
        });
      }

      return c.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Webhook] Google webhook error: ${errorMessage}`);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  // Generic webhook endpoint (for Slack, Linear, custom sources)
  app.post('/webhook/generic', async (c) => {
    try {
      const source = c.req.query('source') || 'custom';
      const eventType = c.req.query('type');
      const body = await c.req.json();

      console.log(`[Webhook] Generic webhook received from ${source}`);

      const result = processGenericWebhook(body, source, eventType);

      if (!result.success || !result.event) {
        return c.json({ success: false, error: result.error || 'Failed to process webhook' }, 400);
      }

      // Publish the event to trigger handlers
      const publishResult = await publishEvent(result.event);
      console.log(`[Webhook] Published ${result.eventType}, matched ${publishResult.matchedSubscriptions} subscriptions`);

      return c.json({
        success: true,
        event: {
          id: result.event.id,
          type: result.event.type,
        },
        matchedSubscriptions: publishResult.matchedSubscriptions,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Webhook] Generic webhook error: ${errorMessage}`);
      return c.json({ success: false, error: errorMessage }, 500);
    }
  });

  return app;
}
