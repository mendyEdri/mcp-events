import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { runAgent } from './agent.js';
import { getMCPEInstance } from './mcpe-integration.js';
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
      <button class="sidebar-tab" data-panel="mcp">MCP Servers</button>
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
    </div>
  </aside>
  <main class="main">
    <header class="chat-header">
      <h1>MCPE Agent Chat</h1>
      <div class="connection-status">
        <span class="status-dot" id="status-dot"></span>
        <span id="status-text">Disconnected</span>
      </div>
    </header>
    <div class="chat-messages" id="chat-messages">
      <div class="message assistant">
        <div class="message-content">Hello! I'm the MCPE Agent. I can help you subscribe to events from various sources like GitHub, Gmail, and Slack.

Try asking me to "subscribe to GitHub push events" or "list my subscriptions".</div>
        <div class="message-meta">Agent</div>
      </div>
    </div>
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
    const textarea = document.getElementById('chat-input');
    textarea.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
    loadTools(); loadMCPServers(); loadStatus(); setInterval(loadStatus, 30000);
  </script>
</body>
</html>`;

// Create Hono app
export function createApp(): Hono {
  const app = new Hono();

  // Enable CORS
  app.use('*', cors());

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

      const result = await runAgent({
        userMessage: message,
        mcpeUrl,
      });

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

  return app;
}
