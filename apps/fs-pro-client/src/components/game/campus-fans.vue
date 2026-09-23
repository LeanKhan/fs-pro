<template>
  <div class="campus-fans-layer" aria-hidden="true">
    <div
      v-for="fan in activeFans"
      :key="fan.id"
      class="fan-actor"
      :style="fan.style"
    >
      <!-- Walking Human SVG Sprite -->
      <svg
        class="fan-svg"
        viewBox="0 0 24 36"
        width="22"
        height="33"
        :class="{ 'is-flipped': fan.movingLeft }"
      >
        <!-- Ground Shadow -->
        <ellipse cx="12" cy="34" rx="7" ry="2.2" class="fan-shadow" />

        <!-- Walking Legs Rig (Back leg) -->
        <g class="fan-leg fan-leg-back" :style="{ animationDuration: `${fan.walkSpeed}s` }">
          <line x1="14" y1="21" x2="16" y2="33" stroke="#1e293b" stroke-width="2.4" stroke-linecap="round" />
          <!-- Shoe -->
          <circle cx="16.5" cy="33" r="1.5" fill="#0f172a" />
        </g>

        <!-- Walking Legs Rig (Front leg) -->
        <g class="fan-leg fan-leg-front" :style="{ animationDuration: `${fan.walkSpeed}s` }">
          <line x1="10" y1="21" x2="8" y2="33" stroke="#334155" stroke-width="2.4" stroke-linecap="round" />
          <!-- Shoe -->
          <circle cx="7.5" cy="33" r="1.5" fill="#0f172a" />
        </g>

        <!-- Torso & Bobbing Upper Body -->
        <g class="fan-torso" :style="{ animationDuration: `${fan.walkSpeed / 2}s` }">
          <!-- Back Arm -->
          <g class="fan-arm fan-arm-back" :style="{ animationDuration: `${fan.walkSpeed}s` }">
            <line x1="14" y1="13" x2="17" y2="21" stroke="#475569" stroke-width="2" stroke-linecap="round" />
          </g>

          <!-- Shirt / Club Kit Body -->
          <rect
            x="9"
            y="11"
            width="6"
            height="11"
            rx="2.5"
            :fill="fan.shirtColor"
            class="fan-shirt"
          />

          <!-- Scarf (on select supporters) -->
          <path
            v-if="fan.hasScarf"
            d="M 8.5 11 Q 12 13 15.5 11 L 16 14 Q 12 15 8 13 Z"
            fill="#fbbf24"
          />

          <!-- Head & Hair -->
          <circle cx="12" cy="6.5" r="4.2" :fill="fan.skinTone" />
          <!-- Hair / Cap -->
          <path
            v-if="fan.hasCap"
            d="M 7.5 6 Q 12 2 16.5 6 L 19 6 L 17 4 Q 12 1 7.5 4 Z"
            fill="#1e293b"
          />
          <path
            v-else
            d="M 7.5 6 Q 12 2.5 16.5 6 Q 16.5 3.5 12 3 Q 7.5 3.5 7.5 6 Z"
            :fill="fan.hairColor"
          />

          <!-- Front Arm -->
          <g class="fan-arm fan-arm-front" :style="{ animationDuration: `${fan.walkSpeed}s` }">
            <line x1="10" y1="13" x2="7" y2="21" stroke="#334155" stroke-width="2" stroke-linecap="round" />
            <circle cx="6.5" cy="21.5" r="1.2" :fill="fan.skinTone" />
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    fansCount?: number;
  }>(),
  {
    fansCount: 120,
  }
);

// Map paths in the 1376 x 768 coordinate space
interface Waypoint {
  x: number;
  y: number;
  pauseMs?: number;
}

interface FanRoute {
  id: string;
  waypoints: Waypoint[];
}

const ROUTES: FanRoute[] = [
  // Route 1: Entrance road to merch stall
  {
    id: 'r1',
    waypoints: [
      { x: 1240, y: 690 },
      { x: 1100, y: 640 },
      { x: 1010, y: 620 },
      { x: 960, y: 650, pauseMs: 2500 },
      { x: 1010, y: 620 },
      { x: 1100, y: 640 },
      { x: 1240, y: 690, pauseMs: 1500 },
    ],
  },
  // Route 2: Merch stall down past the main pitch / dugout
  {
    id: 'r2',
    waypoints: [
      { x: 930, y: 650 },
      { x: 840, y: 590 },
      { x: 740, y: 540 },
      { x: 670, y: 520, pauseMs: 3000 },
      { x: 740, y: 540 },
      { x: 840, y: 590 },
      { x: 930, y: 650, pauseMs: 2000 },
    ],
  },
  // Route 3: Training ground to medical hut
  {
    id: 'r3',
    waypoints: [
      { x: 380, y: 300 },
      { x: 440, y: 260 },
      { x: 500, y: 220 },
      { x: 550, y: 190, pauseMs: 2500 },
      { x: 500, y: 220 },
      { x: 440, y: 260 },
      { x: 380, y: 300, pauseMs: 2000 },
    ],
  },
  // Route 4: Staff cabin to upper promenade
  {
    id: 'r4',
    waypoints: [
      { x: 880, y: 240 },
      { x: 780, y: 270 },
      { x: 670, y: 300, pauseMs: 2000 },
      { x: 570, y: 330, pauseMs: 2500 },
      { x: 670, y: 300 },
      { x: 780, y: 270 },
      { x: 880, y: 240, pauseMs: 1500 },
    ],
  },
  // Route 5: Academy grounds stroll
  {
    id: 'r5',
    waypoints: [
      { x: 210, y: 550 },
      { x: 260, y: 580 },
      { x: 320, y: 610, pauseMs: 3000 },
      { x: 260, y: 580 },
      { x: 210, y: 550, pauseMs: 2000 },
    ],
  },
];

const SHIRT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#e2e8f0'];
const SKIN_TONES = ['#fbcfe8', '#fcd34d', '#d97706', '#92400e', '#78350f'];
const HAIR_COLORS = ['#1e293b', '#78350f', '#d97706', '#0f172a'];

// How many fans to spawn based on club fan count
const targetFanCount = computed(() => {
  const f = props.fansCount ?? 120;
  if (f < 500) return 3;
  if (f < 5000) return 6;
  if (f < 25000) return 10;
  return 15;
});

interface FanEntity {
  id: number;
  routeIndex: number;
  segmentIndex: number;
  progress: number; // 0 to 1 along current segment
  currentX: number;
  currentY: number;
  movingLeft: boolean;
  shirtColor: string;
  skinTone: string;
  hairColor: string;
  hasCap: boolean;
  hasScarf: boolean;
  walkSpeed: number; // seconds per step cycle
  isPaused: boolean;
  pauseTimer: number;
}

const fans = ref<FanEntity[]>([]);

function initFans() {
  const count = targetFanCount.value;
  const list: FanEntity[] = [];

  for (let i = 0; i < count; i++) {
    const routeIndex = i % ROUTES.length;
    const route = ROUTES[routeIndex];
    const segmentIndex = i % (route.waypoints.length - 1);
    const startPt = route.waypoints[segmentIndex];
    const endPt = route.waypoints[segmentIndex + 1];

    list.push({
      id: i + 1,
      routeIndex,
      segmentIndex,
      progress: Math.random() * 0.8,
      currentX: startPt.x,
      currentY: startPt.y,
      movingLeft: endPt.x < startPt.x,
      shirtColor: SHIRT_COLORS[i % SHIRT_COLORS.length],
      skinTone: SKIN_TONES[i % SKIN_TONES.length],
      hairColor: HAIR_COLORS[i % HAIR_COLORS.length],
      hasCap: i % 3 === 0,
      hasScarf: i % 2 === 0,
      walkSpeed: 0.55 + (i % 3) * 0.08,
      isPaused: false,
      pauseTimer: 0,
    });
  }
  fans.value = list;
}

let tickTimer: ReturnType<typeof setInterval> | undefined;

function updateFans() {
  const dt = 0.05; // 50ms per tick

  for (const fan of fans.value) {
    if (fan.isPaused) {
      fan.pauseTimer -= dt * 1000;
      if (fan.pauseTimer <= 0) {
        fan.isPaused = false;
      }
      continue;
    }

    const route = ROUTES[fan.routeIndex];
    const p1 = route.waypoints[fan.segmentIndex];
    const nextIdx = (fan.segmentIndex + 1) % route.waypoints.length;
    const p2 = route.waypoints[nextIdx];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Speed in map pixels per second (approx 20-30 px/s)
    const speed = 24 / Math.max(dist, 1);
    fan.progress += dt * speed;

    if (fan.progress >= 1) {
      fan.progress = 0;
      fan.segmentIndex = nextIdx;
      fan.currentX = p2.x;
      fan.currentY = p2.y;

      // Check if waypoint has a pause duration
      if (p2.pauseMs) {
        fan.isPaused = true;
        fan.pauseTimer = p2.pauseMs;
      }

      // Check next segment direction
      const nextNextIdx = (nextIdx + 1) % route.waypoints.length;
      const nextTarget = route.waypoints[nextNextIdx];
      fan.movingLeft = nextTarget.x < p2.x;
    } else {
      fan.currentX = p1.x + dx * fan.progress;
      fan.currentY = p1.y + dy * fan.progress;
      fan.movingLeft = dx < 0;
    }
  }
}

const activeFans = computed(() => {
  return fans.value.slice(0, targetFanCount.value).map((f) => ({
    ...f,
    style: {
      left: `${(f.currentX / 1376) * 100}%`,
      top: `${(f.currentY / 768) * 100}%`,
      zIndex: Math.round(f.currentY),
    },
  }));
});

onMounted(() => {
  initFans();
  tickTimer = setInterval(updateFans, 50);
});

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<style scoped>
.campus-fans-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.fan-actor {
  position: absolute;
  transform: translate(-50%, -100%);
  will-change: left, top;
}

.fan-svg {
  display: block;
  overflow: visible;
}

.fan-svg.is-flipped {
  transform: scaleX(-1);
}

.fan-shadow {
  fill: rgba(0, 0, 0, 0.35);
}

/* Leg swinging walk cycle */
.fan-leg-front {
  transform-origin: 10px 21px;
  animation: leg-swing-front 0.6s ease-in-out infinite alternate;
}

.fan-leg-back {
  transform-origin: 14px 21px;
  animation: leg-swing-back 0.6s ease-in-out infinite alternate;
}

@keyframes leg-swing-front {
  0% { transform: rotate(-25deg); }
  100% { transform: rotate(25deg); }
}

@keyframes leg-swing-back {
  0% { transform: rotate(25deg); }
  100% { transform: rotate(-25deg); }
}

/* Arm swinging opposite to legs */
.fan-arm-front {
  transform-origin: 10px 13px;
  animation: arm-swing-front 0.6s ease-in-out infinite alternate;
}

.fan-arm-back {
  transform-origin: 14px 13px;
  animation: arm-swing-back 0.6s ease-in-out infinite alternate;
}

@keyframes arm-swing-front {
  0% { transform: rotate(20deg); }
  100% { transform: rotate(-20deg); }
}

@keyframes arm-swing-back {
  0% { transform: rotate(-20deg); }
  100% { transform: rotate(20deg); }
}

/* Vertical torso bobbing on every step */
.fan-torso {
  animation: torso-bob 0.3s ease-in-out infinite alternate;
}

@keyframes torso-bob {
  0% { transform: translateY(0); }
  100% { transform: translateY(-1.5px); }
}
</style>
