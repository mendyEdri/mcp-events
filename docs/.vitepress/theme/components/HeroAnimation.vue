<template>
  <div class="hero-animation">
    <svg viewBox="0 0 800 340" fill="none" xmlns="http://www.w3.org/2000/svg">

      <!-- ============ MCP SERVERS (left column) ============ -->

      <g class="server">
        <rect x="30" y="20" width="180" height="60" rx="12" class="server-box" />
        <text x="120" y="47" class="server-name">GitHub</text>
        <text x="120" y="63" class="server-tag">MCP Server + MCPE</text>
      </g>

      <g class="server">
        <rect x="30" y="110" width="180" height="60" rx="12" class="server-box" />
        <text x="120" y="137" class="server-name">Slack</text>
        <text x="120" y="153" class="server-tag">MCP Server + MCPE</text>
      </g>

      <g class="server">
        <rect x="30" y="200" width="180" height="60" rx="12" class="server-box" />
        <text x="120" y="227" class="server-name">Gmail</text>
        <text x="120" y="243" class="server-tag">MCP Server + MCPE</text>
      </g>

      <g class="server">
        <rect x="30" y="290" width="180" height="60" rx="12" class="server-box" />
        <text x="120" y="317" class="server-name">Your Server</text>
        <text x="120" y="333" class="server-tag">MCP Server + MCPE</text>
      </g>

      <!-- ============ AI AGENT (right) ============ -->

      <g class="agent">
        <rect x="570" y="100" width="200" height="170" rx="18" class="agent-box" />
        <text x="670" y="170" class="agent-title">AI Agent</text>

        <!-- Thinking dots -->
        <circle cx="650" cy="200" r="3.5" class="sparkle s1" />
        <circle cx="670" cy="200" r="3.5" class="sparkle s2" />
        <circle cx="690" cy="200" r="3.5" class="sparkle s3" />

        <text x="670" y="240" class="agent-hint">LLM</text>
      </g>

      <!-- ============ CONNECTION LINES ============ -->

      <!-- Row 1: GitHub -->
      <line x1="210" y1="42" x2="570" y2="155" class="evt-line" />
      <line x1="570" y1="165" x2="210" y2="58" class="sub-line" />

      <!-- Row 2: Slack -->
      <line x1="210" y1="135" x2="570" y2="175" class="evt-line" />
      <line x1="570" y1="185" x2="210" y2="148" class="sub-line" />

      <!-- Row 3: Gmail -->
      <line x1="210" y1="225" x2="570" y2="195" class="evt-line" />
      <line x1="570" y1="205" x2="210" y2="238" class="sub-line" />

      <!-- Row 4: Custom -->
      <line x1="210" y1="315" x2="570" y2="215" class="evt-line" />
      <line x1="570" y1="225" x2="210" y2="328" class="sub-line" />

      <!-- ============ LABELS (centered on each line pair) ============ -->

      <text x="380" y="86" class="label label-evt">event</text>
      <text x="400" y="106" class="label label-sub">subscribe</text>

      <text x="375" y="148" class="label label-evt">event</text>
      <text x="395" y="170" class="label label-sub">subscribe</text>

      <text x="375" y="210" class="label label-evt">event</text>
      <text x="395" y="228" class="label label-sub">subscribe</text>

      <text x="380" y="262" class="label label-evt">event</text>
      <text x="400" y="282" class="label label-sub">subscribe</text>

      <!-- ============ ARROWHEADS ============ -->

      <!-- Event arrows (pointing right → agent) -->
      <polygon points="568,154 558,149 558,159" class="arrow-evt" />
      <polygon points="568,174 558,169 558,179" class="arrow-evt" />
      <polygon points="568,194 558,189 558,199" class="arrow-evt" />
      <polygon points="568,214 558,209 558,219" class="arrow-evt" />

      <!-- Subscribe arrows (pointing left → server) -->
      <polygon points="212,58 222,53 222,63" class="arrow-sub" />
      <polygon points="212,148 222,143 222,153" class="arrow-sub" />
      <polygon points="212,238 222,233 222,243" class="arrow-sub" />
      <polygon points="212,328 222,323 222,333" class="arrow-sub" />

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
        <path id="evt-1" d="M210 42 L570 155" />
        <path id="evt-2" d="M210 135 L570 175" />
        <path id="evt-3" d="M210 225 L570 195" />
        <path id="evt-4" d="M210 315 L570 215" />
        <path id="sub-1" d="M570 165 L210 58" />
        <path id="sub-2" d="M570 185 L210 148" />
        <path id="sub-3" d="M570 205 L210 238" />
        <path id="sub-4" d="M570 225 L210 328" />
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
  font-size: 13px;
  font-weight: 600;
  fill: var(--vp-c-text-3);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
  opacity: 0.5;
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
  opacity: 0.35;
}

.sub-line {
  stroke: var(--vp-c-brand-2);
  stroke-width: 1;
  stroke-dasharray: 6 4;
  opacity: 0.3;
}

/* Arrows */
.arrow-evt { fill: var(--vp-c-brand-1); opacity: 0.5; }
.arrow-sub { fill: var(--vp-c-brand-2); opacity: 0.4; }

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
  opacity: 0.45;
}

/* Mobile */
@media (max-width: 640px) {
  .hero-animation {
    margin: 0 auto 1rem;
  }
  .server-name { font-size: 13px; }
  .server-tag { font-size: 7px; }
  .agent-title { font-size: 18px; }
  .label { font-size: 8px; }
}
</style>
