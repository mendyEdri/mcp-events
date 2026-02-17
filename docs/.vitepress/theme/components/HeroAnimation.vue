<template>
  <div class="hero-animation">
    <svg viewBox="0 0 800 380" fill="none" xmlns="http://www.w3.org/2000/svg">

      <!-- ============ AI AGENT (center) ============ -->
      <g class="agent">
        <rect x="300" y="130" width="200" height="120" rx="18" class="agent-box" />
        <text x="400" y="175" class="agent-title">AI Agent</text>

        <!-- Sparkle dots -->
        <circle cx="380" cy="200" r="3" class="sparkle s1" />
        <circle cx="400" cy="200" r="3" class="sparkle s2" />
        <circle cx="420" cy="200" r="3" class="sparkle s3" />

        <text x="400" y="228" class="agent-hint">calls events_subscribe</text>
      </g>

      <!-- ============ MCP SERVERS (around the agent) ============ -->

      <!-- Top-left: GitHub MCP Server -->
      <g class="server">
        <rect x="40" y="20" width="160" height="72" rx="12" class="server-box" />
        <text x="120" y="50" class="server-name">GitHub</text>
        <text x="120" y="68" class="server-tag">MCP Server + MCPE</text>
      </g>

      <!-- Top-right: Slack MCP Server -->
      <g class="server">
        <rect x="600" y="20" width="160" height="72" rx="12" class="server-box" />
        <text x="680" y="50" class="server-name">Slack</text>
        <text x="680" y="68" class="server-tag">MCP Server + MCPE</text>
      </g>

      <!-- Bottom-left: Gmail MCP Server -->
      <g class="server">
        <rect x="40" y="290" width="160" height="72" rx="12" class="server-box" />
        <text x="120" y="320" class="server-name">Gmail</text>
        <text x="120" y="338" class="server-tag">MCP Server + MCPE</text>
      </g>

      <!-- Bottom-right: Custom MCP Server -->
      <g class="server">
        <rect x="600" y="290" width="160" height="72" rx="12" class="server-box" />
        <text x="680" y="320" class="server-name">Your Server</text>
        <text x="680" y="338" class="server-tag">MCP Server + MCPE</text>
      </g>

      <!-- ============ CONNECTION LINES ============ -->

      <!-- Agent → GitHub (subscribe) -->
      <path d="M320 150 Q 220 100 200 92" class="subscribe-line" />
      <!-- GitHub → Agent (notify) -->
      <path d="M200 80 Q 240 120 300 145" class="notify-line" />

      <!-- Agent → Slack (subscribe) -->
      <path d="M480 150 Q 580 100 600 92" class="subscribe-line" />
      <!-- Slack → Agent (notify) -->
      <path d="M600 80 Q 560 120 500 145" class="notify-line" />

      <!-- Agent → Gmail (subscribe) -->
      <path d="M320 230 Q 220 280 200 290" class="subscribe-line" />
      <!-- Gmail → Agent (notify) -->
      <path d="M200 302 Q 240 265 300 240" class="notify-line" />

      <!-- Agent → Custom (subscribe) -->
      <path d="M480 230 Q 580 280 600 290" class="subscribe-line" />
      <!-- Custom → Agent (notify) -->
      <path d="M600 302 Q 560 265 500 240" class="notify-line" />

      <!-- ============ ANIMATED DOTS ============ -->

      <!-- Subscribe dots: Agent → Servers (tool calls) -->
      <circle r="4" class="sub-dot">
        <animateMotion dur="3s" repeatCount="indefinite" begin="0s">
          <mpath href="#sub-path-1" />
        </animateMotion>
      </circle>
      <circle r="4" class="sub-dot">
        <animateMotion dur="3s" repeatCount="indefinite" begin="1.5s">
          <mpath href="#sub-path-2" />
        </animateMotion>
      </circle>
      <circle r="4" class="sub-dot">
        <animateMotion dur="3.2s" repeatCount="indefinite" begin="0.8s">
          <mpath href="#sub-path-3" />
        </animateMotion>
      </circle>
      <circle r="4" class="sub-dot">
        <animateMotion dur="3.2s" repeatCount="indefinite" begin="2.2s">
          <mpath href="#sub-path-4" />
        </animateMotion>
      </circle>

      <!-- Event dots: Servers → Agent (notifications) -->
      <circle r="5" class="evt-dot d1">
        <animateMotion dur="2.2s" repeatCount="indefinite" begin="0.5s">
          <mpath href="#evt-path-1" />
        </animateMotion>
      </circle>
      <circle r="5" class="evt-dot d2">
        <animateMotion dur="2.4s" repeatCount="indefinite" begin="1.8s">
          <mpath href="#evt-path-2" />
        </animateMotion>
      </circle>
      <circle r="5" class="evt-dot d3">
        <animateMotion dur="2.6s" repeatCount="indefinite" begin="1s">
          <mpath href="#evt-path-3" />
        </animateMotion>
      </circle>
      <circle r="5" class="evt-dot d4">
        <animateMotion dur="2.5s" repeatCount="indefinite" begin="2.5s">
          <mpath href="#evt-path-4" />
        </animateMotion>
      </circle>

      <!-- Second wave of event dots -->
      <circle r="4" class="evt-dot d1">
        <animateMotion dur="2.2s" repeatCount="indefinite" begin="1.6s">
          <mpath href="#evt-path-1" />
        </animateMotion>
      </circle>
      <circle r="4" class="evt-dot d2">
        <animateMotion dur="2.4s" repeatCount="indefinite" begin="0.2s">
          <mpath href="#evt-path-2" />
        </animateMotion>
      </circle>

      <!-- ============ LABELS ============ -->
      <text x="230" y="108" class="label label-sub">tool call</text>
      <text x="565" y="108" class="label label-sub">tool call</text>
      <text x="248" y="140" class="label label-evt">event</text>
      <text x="548" y="140" class="label label-evt">event</text>
      <text x="230" y="278" class="label label-sub">tool call</text>
      <text x="565" y="278" class="label label-sub">tool call</text>
      <text x="248" y="248" class="label label-evt">event</text>
      <text x="548" y="248" class="label label-evt">event</text>

      <!-- ============ HIDDEN MOTION PATHS ============ -->
      <defs>
        <!-- Subscribe paths: Agent → Server -->
        <path id="sub-path-1" d="M320 150 Q 220 100 200 92" />
        <path id="sub-path-2" d="M480 150 Q 580 100 600 92" />
        <path id="sub-path-3" d="M320 230 Q 220 280 200 290" />
        <path id="sub-path-4" d="M480 230 Q 580 280 600 290" />
        <!-- Event paths: Server → Agent -->
        <path id="evt-path-1" d="M200 80 Q 240 120 300 145" />
        <path id="evt-path-2" d="M600 80 Q 560 120 500 145" />
        <path id="evt-path-3" d="M200 302 Q 240 265 300 240" />
        <path id="evt-path-4" d="M600 302 Q 560 265 500 240" />
      </defs>

    </svg>
  </div>
</template>

<style scoped>
.hero-animation {
  max-width: 740px;
  margin: 0 auto 2rem;
  padding: 0 1rem;
}

svg {
  width: 100%;
  height: auto;
}

/* Agent (center) */
.agent-box {
  fill: var(--vp-c-brand-soft);
  stroke: var(--vp-c-brand-1);
  stroke-width: 2.5;
}

.agent-title {
  font-size: 22px;
  font-weight: 800;
  fill: var(--vp-c-text-1);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

.agent-hint {
  font-size: 10px;
  font-weight: 500;
  fill: var(--vp-c-text-3);
  text-anchor: middle;
  font-family: var(--vp-font-family-mono);
  opacity: 0.7;
}

.sparkle {
  fill: var(--vp-c-brand-1);
}
.sparkle.s1 { animation: twinkle 1.5s ease-in-out infinite; }
.sparkle.s2 { animation: twinkle 1.5s ease-in-out infinite 0.5s; }
.sparkle.s3 { animation: twinkle 1.5s ease-in-out infinite 1s; }

@keyframes twinkle {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

/* MCP Servers (around) */
.server-box {
  fill: var(--vp-c-bg-soft);
  stroke: var(--vp-c-border);
  stroke-width: 1.5;
}

.server-name {
  font-size: 16px;
  font-weight: 700;
  fill: var(--vp-c-text-1);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

.server-tag {
  font-size: 9px;
  font-weight: 500;
  fill: var(--vp-c-text-3);
  text-anchor: middle;
  font-family: var(--vp-font-family-mono);
  letter-spacing: 0.3px;
}

/* Lines */
.subscribe-line {
  stroke: var(--vp-c-brand-2);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  fill: none;
  opacity: 0.5;
}

.notify-line {
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
  fill: none;
  opacity: 0.7;
}

/* Animated dots */
.sub-dot {
  fill: var(--vp-c-brand-2);
  opacity: 0.8;
}

.evt-dot {
  opacity: 0.9;
}
.evt-dot.d1 { fill: #6C5CE7; }
.evt-dot.d2 { fill: #E17055; }
.evt-dot.d3 { fill: #00B894; }
.evt-dot.d4 { fill: #FDCB6E; }

/* Labels */
.label {
  font-size: 9px;
  font-weight: 600;
  font-family: var(--vp-font-family-mono);
  text-anchor: middle;
  letter-spacing: 0.5px;
}

.label-sub {
  fill: var(--vp-c-brand-2);
  opacity: 0.6;
}

.label-evt {
  fill: var(--vp-c-brand-1);
  opacity: 0.6;
}

/* Mobile */
@media (max-width: 640px) {
  .hero-animation {
    margin: 0 auto 1rem;
  }
  .server-name { font-size: 13px; }
  .server-tag { font-size: 7px; }
  .agent-title { font-size: 18px; }
  .label { font-size: 7px; }
}
</style>
