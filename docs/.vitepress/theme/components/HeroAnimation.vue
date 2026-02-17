<template>
  <div class="hero-animation">
    <svg viewBox="0 0 760 300" fill="none" xmlns="http://www.w3.org/2000/svg">

      <!-- ============ MCP SERVERS (left column) ============ -->

      <g class="server">
        <rect x="20" y="10" width="170" height="52" rx="10" class="server-box" />
        <text x="105" y="34" class="server-name">GitHub</text>
        <text x="105" y="48" class="server-tag">MCP Server + MCPE</text>
      </g>

      <g class="server">
        <rect x="20" y="80" width="170" height="52" rx="10" class="server-box" />
        <text x="105" y="104" class="server-name">Slack</text>
        <text x="105" y="118" class="server-tag">MCP Server + MCPE</text>
      </g>

      <g class="server">
        <rect x="20" y="150" width="170" height="52" rx="10" class="server-box" />
        <text x="105" y="174" class="server-name">Gmail</text>
        <text x="105" y="188" class="server-tag">MCP Server + MCPE</text>
      </g>

      <g class="server">
        <rect x="20" y="220" width="170" height="52" rx="10" class="server-box" />
        <text x="105" y="244" class="server-name">Your Server</text>
        <text x="105" y="258" class="server-tag">MCP Server + MCPE</text>
      </g>

      <!-- ============ AI AGENT (right) ============ -->

      <g class="agent">
        <rect x="545" y="55" width="195" height="172" rx="18" class="agent-box" />
        <text x="642" y="130" class="agent-title">AI Agent</text>

        <!-- Thinking dots -->
        <circle cx="622" cy="158" r="3.5" class="sparkle s1" />
        <circle cx="642" cy="158" r="3.5" class="sparkle s2" />
        <circle cx="662" cy="158" r="3.5" class="sparkle s3" />

        <text x="642" y="198" class="agent-hint">LLM</text>
      </g>

      <!-- ============ CONNECTION LINES ============ -->

      <!-- Row 1: GitHub -->
      <line x1="190" y1="30" x2="545" y2="110" class="evt-line" />
      <line x1="545" y1="120" x2="190" y2="42" class="sub-line" />

      <!-- Row 2: Slack -->
      <line x1="190" y1="100" x2="545" y2="130" class="evt-line" />
      <line x1="545" y1="140" x2="190" y2="112" class="sub-line" />

      <!-- Row 3: Gmail -->
      <line x1="190" y1="170" x2="545" y2="152" class="evt-line" />
      <line x1="545" y1="162" x2="190" y2="182" class="sub-line" />

      <!-- Row 4: Custom -->
      <line x1="190" y1="240" x2="545" y2="172" class="evt-line" />
      <line x1="545" y1="182" x2="190" y2="252" class="sub-line" />

      <!-- ============ LABELS ============ -->

      <text x="360" y="60" class="label label-evt">event</text>
      <text x="375" y="78" class="label label-sub">subscribe</text>

      <text x="355" y="110" class="label label-evt">event</text>
      <text x="370" y="128" class="label label-sub">subscribe</text>

      <text x="355" y="160" class="label label-evt">event</text>
      <text x="370" y="178" class="label label-sub">subscribe</text>

      <text x="360" y="204" class="label label-evt">event</text>
      <text x="375" y="222" class="label label-sub">subscribe</text>

      <!-- ============ ARROWHEADS ============ -->

      <!-- Event arrows (→ agent) -->
      <polygon points="543,109 533,104 533,114" class="arrow-evt" />
      <polygon points="543,129 533,124 533,134" class="arrow-evt" />
      <polygon points="543,151 533,146 533,156" class="arrow-evt" />
      <polygon points="543,171 533,166 533,176" class="arrow-evt" />

      <!-- Subscribe arrows (→ server) -->
      <polygon points="192,42 202,37 202,47" class="arrow-sub" />
      <polygon points="192,112 202,107 202,117" class="arrow-sub" />
      <polygon points="192,182 202,177 202,187" class="arrow-sub" />
      <polygon points="192,252 202,247 202,257" class="arrow-sub" />

      <!-- ============ ANIMATED DOTS ============ -->

      <!-- Event dots: Server → Agent -->
      <circle r="5" class="evt-dot d1">
        <animateMotion dur="2.5s" repeatCount="indefinite" begin="0s">
          <mpath href="#evt-1" />
        </animateMotion>
      </circle>
      <circle r="5" class="evt-dot d2">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.8s">
          <mpath href="#evt-2" />
        </animateMotion>
      </circle>
      <circle r="5" class="evt-dot d3">
        <animateMotion dur="2.6s" repeatCount="indefinite" begin="1.6s">
          <mpath href="#evt-3" />
        </animateMotion>
      </circle>
      <circle r="5" class="evt-dot d4">
        <animateMotion dur="3s" repeatCount="indefinite" begin="2.2s">
          <mpath href="#evt-4" />
        </animateMotion>
      </circle>

      <!-- Extra event dots (staggered) -->
      <circle r="4" class="evt-dot d1">
        <animateMotion dur="2.5s" repeatCount="indefinite" begin="1.3s">
          <mpath href="#evt-1" />
        </animateMotion>
      </circle>
      <circle r="4" class="evt-dot d3">
        <animateMotion dur="2.6s" repeatCount="indefinite" begin="0.3s">
          <mpath href="#evt-3" />
        </animateMotion>
      </circle>

      <!-- Subscribe dots: Agent → Server -->
      <circle r="4" class="sub-dot">
        <animateMotion dur="3s" repeatCount="indefinite" begin="0.5s">
          <mpath href="#sub-1" />
        </animateMotion>
      </circle>
      <circle r="4" class="sub-dot">
        <animateMotion dur="3.2s" repeatCount="indefinite" begin="2s">
          <mpath href="#sub-2" />
        </animateMotion>
      </circle>
      <circle r="4" class="sub-dot">
        <animateMotion dur="3.4s" repeatCount="indefinite" begin="1s">
          <mpath href="#sub-3" />
        </animateMotion>
      </circle>
      <circle r="4" class="sub-dot">
        <animateMotion dur="3.1s" repeatCount="indefinite" begin="2.5s">
          <mpath href="#sub-4" />
        </animateMotion>
      </circle>

      <!-- ============ MOTION PATHS ============ -->
      <defs>
        <path id="evt-1" d="M190 30 L545 110" />
        <path id="evt-2" d="M190 100 L545 130" />
        <path id="evt-3" d="M190 170 L545 152" />
        <path id="evt-4" d="M190 240 L545 172" />
        <path id="sub-1" d="M545 120 L190 42" />
        <path id="sub-2" d="M545 140 L190 112" />
        <path id="sub-3" d="M545 162 L190 182" />
        <path id="sub-4" d="M545 182 L190 252" />
      </defs>

    </svg>
  </div>
</template>

<style scoped>
.hero-animation {
  max-width: 800px;
  margin: 1rem auto 2.5rem;
  padding: 0 1rem;
}

svg {
  width: 100%;
  height: auto;
}

/* Agent */
.agent-box {
  fill: var(--vp-c-brand-soft);
  stroke: var(--vp-c-brand-1);
  stroke-width: 2.5;
}

.agent-title {
  font-size: 24px;
  font-weight: 800;
  fill: var(--vp-c-text-1);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

.agent-hint {
  font-size: 14px;
  font-weight: 600;
  fill: var(--vp-c-text-3);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
  opacity: 0.45;
}

.sparkle {
  fill: var(--vp-c-brand-1);
}
.sparkle.s1 { animation: twinkle 1.8s ease-in-out infinite; }
.sparkle.s2 { animation: twinkle 1.8s ease-in-out infinite 0.6s; }
.sparkle.s3 { animation: twinkle 1.8s ease-in-out infinite 1.2s; }

@keyframes twinkle {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}

/* Servers */
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
}

/* Lines */
.evt-line {
  stroke: var(--vp-c-brand-1);
  stroke-width: 1.5;
  opacity: 0.3;
}

.sub-line {
  stroke: var(--vp-c-brand-2);
  stroke-width: 1;
  stroke-dasharray: 6 4;
  opacity: 0.25;
}

/* Arrows */
.arrow-evt { fill: var(--vp-c-brand-1); opacity: 0.45; }
.arrow-sub { fill: var(--vp-c-brand-2); opacity: 0.35; }

/* Animated dots */
.evt-dot { opacity: 0.9; }
.evt-dot.d1 { fill: #6C5CE7; }
.evt-dot.d2 { fill: #E17055; }
.evt-dot.d3 { fill: #00B894; }
.evt-dot.d4 { fill: #FDCB6E; }

.sub-dot {
  fill: var(--vp-c-brand-2);
  opacity: 0.7;
}

/* Labels */
.label {
  font-size: 10px;
  font-weight: 600;
  font-family: var(--vp-font-family-mono);
  text-anchor: middle;
  letter-spacing: 0.5px;
}

.label-evt {
  fill: var(--vp-c-brand-1);
  opacity: 0.5;
}

.label-sub {
  fill: var(--vp-c-brand-2);
  opacity: 0.4;
}

/* Mobile */
@media (max-width: 640px) {
  .hero-animation {
    margin: 0.5rem auto 1.5rem;
  }
  .server-name { font-size: 13px; }
  .server-tag { font-size: 7px; }
  .agent-title { font-size: 18px; }
  .label { font-size: 8px; }
}
</style>
