<template>
  <div class="hero-animation">
    <svg viewBox="0 0 800 320" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- External Sources (left) -->
      <g class="sources">
        <rect x="20" y="30" width="120" height="52" rx="10" class="source-box github" />
        <text x="80" y="61" class="source-label">GitHub</text>

        <rect x="20" y="110" width="120" height="52" rx="10" class="source-box slack" />
        <text x="80" y="141" class="source-label">Slack</text>

        <rect x="20" y="190" width="120" height="52" rx="10" class="source-box gmail" />
        <text x="80" y="221" class="source-label">Gmail</text>

        <rect x="20" y="255" width="120" height="52" rx="10" class="source-box calendar" />
        <text x="80" y="286" class="source-label">Calendar</text>
      </g>

      <!-- MCPE Server (center) -->
      <g class="server">
        <rect x="280" y="70" width="180" height="180" rx="16" class="server-box" />
        <text x="370" y="130" class="server-title">MCPE</text>
        <text x="370" y="155" class="server-subtitle">Server</text>

        <!-- Lightning bolt icon -->
        <path d="M378 170 L366 198 L378 198 L370 218 L390 194 L378 194 Z" class="bolt" />
      </g>

      <!-- AI Agent (right) -->
      <g class="agent">
        <rect x="600" y="95" width="170" height="130" rx="16" class="agent-box" />
        <text x="685" y="145" class="agent-title">AI Agent</text>
        <text x="685" y="170" class="agent-subtitle">LLM Subscriber</text>

        <!-- Sparkle icon -->
        <circle cx="685" cy="195" r="3" class="sparkle s1" />
        <circle cx="673" cy="195" r="2" class="sparkle s2" />
        <circle cx="697" cy="195" r="2" class="sparkle s3" />
      </g>

      <!-- Flow lines: Sources → Server -->
      <g class="flow-lines-in">
        <path d="M140 56 Q 210 56 280 140" class="flow-line in-1" />
        <path d="M140 136 Q 210 136 280 155" class="flow-line in-2" />
        <path d="M140 216 Q 210 216 280 175" class="flow-line in-3" />
        <path d="M140 281 Q 210 281 280 200" class="flow-line in-4" />
      </g>

      <!-- Flow line: Server → Agent (events delivered) -->
      <path d="M460 160 L600 160" class="flow-line out" />

      <!-- Subscribe arrow: Agent → Server -->
      <path d="M600 175 L460 175" class="subscribe-line" />

      <!-- Animated event dots: Sources → Server -->
      <circle r="5" class="event-dot dot-1">
        <animateMotion dur="2.5s" repeatCount="indefinite" begin="0s">
          <mpath href="#path-1" />
        </animateMotion>
      </circle>
      <circle r="5" class="event-dot dot-2">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="0.7s">
          <mpath href="#path-2" />
        </animateMotion>
      </circle>
      <circle r="5" class="event-dot dot-3">
        <animateMotion dur="3s" repeatCount="indefinite" begin="1.4s">
          <mpath href="#path-3" />
        </animateMotion>
      </circle>
      <circle r="4" class="event-dot dot-4">
        <animateMotion dur="3.2s" repeatCount="indefinite" begin="2s">
          <mpath href="#path-4" />
        </animateMotion>
      </circle>

      <!-- Animated event dots: Server → Agent -->
      <circle r="6" class="event-dot dot-out">
        <animateMotion dur="2s" repeatCount="indefinite" begin="1s">
          <mpath href="#path-out" />
        </animateMotion>
      </circle>
      <circle r="6" class="event-dot dot-out-2">
        <animateMotion dur="2s" repeatCount="indefinite" begin="2.2s">
          <mpath href="#path-out" />
        </animateMotion>
      </circle>

      <!-- Subscribe pulse: Agent → Server -->
      <circle r="4" class="subscribe-dot">
        <animateMotion dur="3s" repeatCount="indefinite" begin="0.5s">
          <mpath href="#path-sub" />
        </animateMotion>
      </circle>

      <!-- Hidden motion paths -->
      <defs>
        <path id="path-1" d="M140 56 Q 210 56 280 140" />
        <path id="path-2" d="M140 136 Q 210 136 280 155" />
        <path id="path-3" d="M140 216 Q 210 216 280 175" />
        <path id="path-4" d="M140 281 Q 210 281 280 200" />
        <path id="path-out" d="M460 160 L600 160" />
        <path id="path-sub" d="M600 175 L460 175" />
      </defs>

      <!-- Labels -->
      <text x="210" y="28" class="label">Events</text>
      <text x="520" y="148" class="label">Notify</text>
      <text x="512" y="196" class="label subscribe-label">Subscribe</text>

      <!-- Small arrowheads -->
      <polygon points="278,138 270,132 270,144" class="arrow-in" />
      <polygon points="598,157 606,153 606,163" class="arrow-out" />
      <polygon points="462,172 454,168 454,178" class="arrow-sub" />
    </svg>
  </div>
</template>

<style scoped>
.hero-animation {
  max-width: 720px;
  margin: 0 auto 2rem;
  padding: 0 1rem;
}

svg {
  width: 100%;
  height: auto;
}

/* Source boxes */
.source-box {
  fill: var(--vp-c-bg-soft);
  stroke: var(--vp-c-border);
  stroke-width: 1.5;
  transition: fill 0.3s;
}

.source-label {
  font-size: 14px;
  font-weight: 600;
  fill: var(--vp-c-text-1);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

/* Server box */
.server-box {
  fill: var(--vp-c-brand-soft);
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
}

.server-title {
  font-size: 24px;
  font-weight: 800;
  fill: var(--vp-c-brand-1);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

.server-subtitle {
  font-size: 13px;
  font-weight: 500;
  fill: var(--vp-c-text-2);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

.bolt {
  fill: var(--vp-c-brand-1);
  opacity: 0.8;
  animation: pulse-bolt 2s ease-in-out infinite;
}

@keyframes pulse-bolt {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* Agent box */
.agent-box {
  fill: var(--vp-c-bg-soft);
  stroke: var(--vp-c-brand-2);
  stroke-width: 2;
}

.agent-title {
  font-size: 20px;
  font-weight: 700;
  fill: var(--vp-c-text-1);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

.agent-subtitle {
  font-size: 11px;
  font-weight: 500;
  fill: var(--vp-c-text-3);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
}

.sparkle {
  fill: var(--vp-c-brand-1);
}

.sparkle.s1 { animation: twinkle 1.5s ease-in-out infinite; }
.sparkle.s2 { animation: twinkle 1.5s ease-in-out infinite 0.5s; }
.sparkle.s3 { animation: twinkle 1.5s ease-in-out infinite 1s; }

@keyframes twinkle {
  0%, 100% { opacity: 0.3; r: 2; }
  50% { opacity: 1; r: 3.5; }
}

/* Flow lines */
.flow-line {
  stroke: var(--vp-c-border);
  stroke-width: 1.5;
  fill: none;
  stroke-dasharray: 6 4;
}

.flow-line.out {
  stroke: var(--vp-c-brand-1);
  stroke-width: 2;
  stroke-dasharray: none;
}

.subscribe-line {
  stroke: var(--vp-c-brand-2);
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  fill: none;
}

/* Animated dots */
.event-dot {
  opacity: 0.9;
}

.dot-1 { fill: #6C5CE7; }
.dot-2 { fill: #E17055; }
.dot-3 { fill: #00B894; }
.dot-4 { fill: #FDCB6E; }
.dot-out { fill: var(--vp-c-brand-1); }
.dot-out-2 { fill: var(--vp-c-brand-2); }

.subscribe-dot {
  fill: var(--vp-c-brand-2);
  opacity: 0.7;
}

/* Labels */
.label {
  font-size: 11px;
  font-weight: 600;
  fill: var(--vp-c-text-3);
  text-anchor: middle;
  font-family: var(--vp-font-family-base);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.subscribe-label {
  fill: var(--vp-c-brand-2);
}

/* Arrows */
.arrow-in { fill: var(--vp-c-border); }
.arrow-out { fill: var(--vp-c-brand-1); }
.arrow-sub { fill: var(--vp-c-brand-2); }

/* Mobile */
@media (max-width: 640px) {
  .hero-animation {
    margin: 0 auto 1rem;
  }

  .source-label { font-size: 11px; }
  .server-title { font-size: 18px; }
  .agent-title { font-size: 16px; }
}
</style>
