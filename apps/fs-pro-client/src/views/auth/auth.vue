<template>
  <div class="cozy auth">
    <!-- A little football town at sunrise, drawn in code (no image assets). -->
    <svg class="auth-scene" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="auth-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8fd3ef" />
          <stop offset=".62" stop-color="#ffe7b3" />
          <stop offset="1" stop-color="#ffd38a" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#auth-sky)" />
      <circle cx="1240" cy="250" r="90" fill="#fff4c9" opacity=".9" />
      <g fill="#fff" opacity=".85">
        <ellipse class="cloud c1" cx="280" cy="170" rx="110" ry="34" />
        <ellipse class="cloud c1" cx="350" cy="150" rx="70" ry="38" />
        <ellipse class="cloud c2" cx="960" cy="120" rx="130" ry="32" />
        <ellipse class="cloud c2" cx="1040" cy="100" rx="80" ry="36" />
      </g>
      <path d="M0 600 C220 520 420 560 640 600 S1080 520 1300 560 1600 600 1600 600 V900 H0Z" fill="#8fcf63" />
      <path d="M0 680 C260 620 520 660 820 700 S1300 640 1600 690 V900 H0Z" fill="#6dbb47" />
      <g transform="translate(560 690)">
        <path d="M0 0 L480 0 L540 120 L-60 120 Z" fill="#4fa83a" stroke="#fff" stroke-width="4" />
        <path d="M240 0 L240 120" stroke="#fff" stroke-width="3" />
        <ellipse cx="240" cy="60" rx="46" ry="18" fill="none" stroke="#fff" stroke-width="3" />
        <path d="M-10 32 h40 v56 h-58 z M490 32 h-40 v56 h58 z" fill="none" stroke="#fff" stroke-width="3" />
      </g>
      <g class="houses">
        <g v-for="h in HOUSES" :key="h.x" :transform="`translate(${h.x} ${h.y}) scale(${h.s})`">
          <rect x="-26" y="-34" width="52" height="40" fill="#fff6e0" stroke="#5e3b22" stroke-width="3" />
          <path d="M-32 -32 L0 -60 L32 -32 Z" :fill="h.roof" stroke="#5e3b22" stroke-width="3" stroke-linejoin="round" />
          <rect x="-8" y="-14" width="16" height="20" fill="#8a5a3b" />
        </g>
      </g>
      <g v-for="t in TREES" :key="`t${t.x}`" :transform="`translate(${t.x} ${t.y}) scale(${t.s})`">
        <rect x="-4" y="0" width="8" height="16" fill="#8a5a3b" />
        <circle cy="-8" r="22" fill="#4f9a3a" />
        <circle cx="-7" cy="-14" r="8" fill="#fff" opacity=".15" />
      </g>
      <circle class="ball" cx="800" cy="760" r="12" fill="#fff" stroke="#2b2b3a" stroke-width="3" />
    </svg>

    <div class="crest-rain" aria-hidden="true">
      <img v-for="c in CRESTS" :key="c.code" :src="crestUrl(c.code)" :style="c.style" alt="" />
    </div>

    <main class="auth-card">
      <img class="auth-logo" src="/logo-new.png" alt="FS Pro" />
      <p class="auth-tag">Found a club. Make your town proud. Take on the world.</p>
      <nav class="auth-tabs" aria-label="Sign in or join">
        <router-link to="/auth/login" :class="{ on: route.path.endsWith('login') }">Sign in</router-link>
        <router-link to="/auth/join" :class="{ on: route.path.endsWith('join') }">New manager</router-link>
      </nav>
      <router-view />
    </main>

    <footer class="auth-foot">
      <router-link to="/credits">Credits</router-link>
      <span>{{ new Date().getFullYear() }} · ESL &amp; TSL</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { crestUrl } from '@/helpers/crest';
import '@/components/cozy/cozy.scss';

const route = useRoute();

const HOUSES = [
  { x: 120, y: 640, s: 1, roof: '#e5402f' },
  { x: 210, y: 655, s: 0.8, roof: '#3a8ee0' },
  { x: 1380, y: 640, s: 1.05, roof: '#2f8a1c' },
  { x: 1480, y: 660, s: 0.85, roof: '#e5402f' },
  { x: 1290, y: 668, s: 0.75, roof: '#f08a1c' },
];
const TREES = [
  { x: 330, y: 650, s: 1 },
  { x: 60, y: 690, s: 0.9 },
  { x: 1180, y: 660, s: 1.1 },
  { x: 1560, y: 700, s: 0.9 },
];
const CRESTS = ['RP', 'SUN', 'BAT', 'ZD', 'GBL', 'NET', 'TRI', 'SPO'].map((code, i) => ({
  code,
  style: { left: `${6 + i * 12}%`, animationDelay: `${-i * 2.3}s`, animationDuration: `${16 + (i % 3) * 4}s` },
}));
</script>

<style scoped>
.auth {
  background: #8fd3ef;
  display: grid;
  place-items: center;
  overflow: auto;
}
.auth-scene {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cloud {
  animation: drift 40s linear infinite alternate;
}
.cloud.c2 {
  animation-duration: 55s;
}
@keyframes drift {
  to {
    transform: translateX(120px);
  }
}
.ball {
  animation: kick 3.2s ease-in-out infinite;
}
@keyframes kick {
  50% {
    transform: translate(140px, -40px);
  }
}
.crest-rain {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.crest-rain img {
  position: absolute;
  top: -80px;
  width: 44px;
  height: 48px;
  opacity: 0.5;
  animation: float-down linear infinite;
}
@keyframes float-down {
  to {
    transform: translateY(calc(100vh + 120px)) rotate(25deg);
  }
}
.auth-card {
  position: relative;
  z-index: 2;
  width: min(440px, calc(100vw - 32px));
  margin: 40px 0 60px;
  padding: 18px 22px 22px;
  border-radius: 24px;
  background: var(--cream);
  border: 4px solid #c9a46a;
  box-shadow: var(--shadow);
  animation: pop 0.25s ease-out;
}
.auth-logo {
  display: block;
  height: 84px;
  margin: -6px auto 2px;
  filter: drop-shadow(0 3px 0 rgba(70, 40, 15, 0.25));
}
.auth-tag {
  margin: 0 0 12px;
  text-align: center;
  color: var(--muted);
  font-weight: 500;
}
.auth-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px;
  margin-bottom: 12px;
  border-radius: 14px;
  background: #f1dfb6;
  border: 2px solid #e2cc9c;
}
.auth-tabs a {
  padding: 7px;
  border-radius: 10px;
  text-align: center;
  font-weight: 600;
  color: var(--wood-d);
  text-decoration: none;
}
.auth-tabs a.on {
  background: var(--green);
  color: #fff;
  box-shadow: 0 2px 0 var(--green-d);
}
.auth-foot {
  position: fixed;
  bottom: 8px;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  justify-content: center;
  gap: 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fffaf0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.auth-foot a {
  color: inherit;
}
@media (prefers-reduced-motion: reduce) {
  .cloud,
  .ball,
  .crest-rain img {
    animation: none;
  }
  .crest-rain {
    display: none;
  }
}
</style>
