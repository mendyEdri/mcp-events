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
} from './events-demo.js';
import { createEvent } from '@mcpe/core';
import { getSubscriptionsJSON, getConfigPath, setSubscriptionEnabled } from './mcpe-config.js';

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
    .sidebar-tab { flex: 1; padding: 12px; text-align: center; cursor: pointer; background: transparent; border: none; color: #888; font-size: 13px; transition: all 0.2s; }
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
        <div class="add-form">
          <h4>Add MCP Server</h4>
          <div class="form-group">
            <label>Server Name</label>
            <input type="text" id="new-mcp-name" placeholder="my-server">
          </div>
          <div class="form-group">
            <label>Command</label>
            <input type="text" id="new-mcp-command" placeholder="npx @modelcontextprotocol/server-xxx">
          </div>
          <div class="form-group">
            <label>Arguments (comma-separated)</label>
            <input type="text" id="new-mcp-args" placeholder="--port, 3000">
          </div>
          <button class="btn btn-primary" onclick="addMCPServer()">Add Server</button>
        </div>
        <div style="margin-top: 16px;">
          <button class="btn btn-secondary" onclick="showImportModal()" style="width: 100%;">Import/Export Config</button>
        </div>
      </div>
      <div id="subs-panel" class="panel">
        <div id="subs-list"></div>
        <div style="margin-top: 16px; padding: 12px; background: #1a1a2e; border-radius: 8px; border: 1px dashed #0f3460;">
          <p style="font-size: 12px; color: #888; margin-bottom: 8px;">Subscriptions are defined in mcpe.json</p>
          <p id="config-path" style="font-size: 11px; color: #666; font-family: monospace;"></p>
        </div>
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
      <h3>MCP Configuration</h3>
      <p style="font-size: 13px; color: #888; margin-bottom: 12px;">Import or export your MCP server configuration in JSON format.</p>
      <textarea class="json-editor" id="config-json" placeholder='{"mcpServers": {}}'></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-secondary" onclick="exportConfig()">Export</button>
        <button class="btn btn-primary" onclick="importConfig()">Import</button>
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
    async function addMCPServer() {
      const name = document.getElementById('new-mcp-name').value.trim();
      const command = document.getElementById('new-mcp-command').value.trim();
      const argsStr = document.getElementById('new-mcp-args').value.trim();
      if (!name || !command) { alert('Please fill in name and command'); return; }
      const args = argsStr ? argsStr.split(',').map(a => a.trim()).filter(Boolean) : [];
      try {
        await fetch(API_BASE + '/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, command, args }) });
        document.getElementById('new-mcp-name').value = '';
        document.getElementById('new-mcp-command').value = '';
        document.getElementById('new-mcp-args').value = '';
        loadMCPServers();
      } catch (err) { console.error('Failed to add MCP server:', err); }
    }
    function showImportModal() { document.getElementById('config-modal').classList.add('active'); exportConfig(); }
    function closeModal() { document.getElementById('config-modal').classList.remove('active'); }
    async function exportConfig() {
      try { const res = await fetch(API_BASE + '/api/mcp/config'); const data = await res.json(); document.getElementById('config-json').value = JSON.stringify(data.config, null, 2); }
      catch (err) { console.error('Failed to export config:', err); }
    }
    async function importConfig() {
      const json = document.getElementById('config-json').value;
      try {
        const config = JSON.parse(json);
        const res = await fetch(API_BASE + '/api/mcp/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
        const data = await res.json();
        if (data.success) { closeModal(); loadMCPServers(); loadTools(); }
        else { alert('Failed to import: ' + (data.error || 'Unknown error')); }
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
    function renderSubscriptions(subs) {
      const container = document.getElementById('subs-list');
      if (!subs || subs.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 13px; text-align: center; padding: 20px;">No subscriptions in mcpe.json</p>';
        return;
      }
      container.innerHTML = subs.map(sub => {
        const filters = sub.filter.eventTypes ? sub.filter.eventTypes.join(', ') : (sub.filter.sources ? sub.filter.sources.join(', ') : 'all');
        const cronInfo = sub.delivery && sub.delivery.cronExpression ? '<div style="font-size: 11px; color: #888; margin-top: 4px;">Cron: ' + sub.delivery.cronExpression + '</div>' : '';
        return '<div class="mcp-item"><div class="mcp-header"><span class="mcp-name">' + sub.name + '</span><label class="toggle"><input type="checkbox" ' + (sub.enabled ? 'checked' : '') + ' onchange="toggleSubscription(\\'' + sub.name + '\\', this.checked)"><span class="toggle-slider"></span></label></div><div class="mcp-command" style="color: #e94560;">' + sub.handlerType + '</div><div style="font-size: 12px; color: #888; margin-top: 4px;">Filter: ' + filters + '</div>' + cronInfo + (sub.description ? '<div style="font-size: 11px; color: #666; margin-top: 8px; font-style: italic;">' + sub.description + '</div>' : '') + '</div>';
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
    loadTools(); loadMCPServers(); loadSubscriptions(); loadMessages(); loadStatus(); setInterval(loadStatus, 30000);
    // SSE for delayed responses
    const evtSource = new EventSource(API_BASE + '/chat/events');
    evtSource.onmessage = function(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'response') {
          addMessage('[Delayed Response]\\n\\n' + data.response, 'assistant');
        }
      } catch (err) { /* ignore */ }
    };
    evtSource.onerror = function() { console.log('SSE reconnecting...'); };
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

      const result = await runAgent({
        userMessage: message,
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

  return app;
}
