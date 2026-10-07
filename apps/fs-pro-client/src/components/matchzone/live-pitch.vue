<template>
  <div class="live-pitch">
    <div class="pitch-wrap">
      <svg class="markings" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="1" y="1" width="98" height="98" />
        <line x1="50" y1="1" x2="50" y2="99" />
        <circle cx="50" cy="50" r="9" />
        <circle cx="50" cy="50" r="0.6" fill="rgba(255,255,255,0.4)" />
        <rect x="1" y="30" width="14" height="40" />
        <rect x="1" y="40" width="5" height="20" />
        <rect x="85" y="30" width="14" height="40" />
        <rect x="94" y="40" width="5" height="20" />
      </svg>

      <!-- SVG Action Trajectory Vectors Layer -->
      <svg class="action-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <marker
            id="arrow-pass-home"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#38bdf8" />
          </marker>
          <marker
            id="arrow-pass-away"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#fbbf24" />
          </marker>
          <marker
            id="arrow-shot"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#f97316" />
          </marker>
          <marker
            id="arrow-turnover"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ef4444" />
          </marker>
        </defs>

        <g
          v-for="v in activeVectors"
          :key="v.id"
          :style="{ opacity: vectorOpacity(v) }"
        >
          <line
            :x1="v.fromX"
            :y1="v.fromY"
            :x2="v.toX"
            :y2="v.toY"
            class="action-vector-line"
            :class="[v.type, v.side]"
            :marker-end="getMarkerEnd(v)"
          />
          <circle
            :cx="v.toX"
            :cy="v.toY"
            class="action-target-ping"
            :class="[v.type, v.side]"
            r="1.6"
          />
        </g>
      </svg>

      <div
        v-for="p in visiblePlayers"
        :key="p.id"
        class="player"
        :class="[
          p.side,
          {
            gk: p.pos === 'GK',
            'with-ball': p.withBall,
            'sent-off': p.matchStatus === 'sent-off',
          },
        ]"
        :style="playerStyle(p)"
        @mouseenter="hoveredId = p.id"
        @mouseleave="hoveredId = null"
      >
        <div
          class="player-sprite"
          :class="[
            `anim-${getPlayerAnimation(p)}`,
            `dir-${getPlayerDirection(p)}`,
          ]"
          :style="{
            backgroundImage:
              p.side === 'home' ? homePlayerSpriteUrl : awayPlayerSpriteUrl,
          }"
        ></div>
      </div>

      <div
        v-if="frame"
        class="ball"
        role="img"
        aria-label="Ball"
        :style="{
          ...ballStyle(),
          backgroundImage: `url(${ballSprite})`,
        }"
      ></div>

      <!-- Floating Player Action Badges Layer -->
      <div
        v-for="action in activeActions"
        :key="action.id"
        class="action-badge"
        :class="[action.side, action.type]"
        :style="actionBadgeStyle(action)"
      >
        <span class="badge-icon">{{ action.icon }}</span>
        <span class="badge-text">{{ action.text }}</span>
      </div>

      <div
        v-if="hoveredPlayer"
        class="player-tooltip"
        :style="toPct(hoveredPlayer)"
      >
        <div class="tooltip-name">
          {{ hoveredPlayer.name }}
          <span class="tooltip-num">#{{ hoveredPlayer.num }}</span>
        </div>
        <div class="tooltip-row">
          {{ hoveredPlayer.pos }} · ★ {{ hoveredPlayer.rating ?? '-' }}
        </div>
        <div class="tooltip-row">
          <span
            v-if="hoveredPlayer.matchStatus === 'sent-off'"
            class="tooltip-red"
          >
            Sent off
          </span>
          <span
            v-else-if="hoveredPlayer.yellowCards > 0"
            class="tooltip-yellow"
          >
            {{ hoveredPlayer.yellowCards > 1 ? 'x2 ' : '' }}Yellow card
          </span>
          <span v-else>Active</span>
        </div>
      </div>
    </div>

    <div class="meta-line">
      <span>
        {{ home?.name }} [{{ home?.code }}] vs {{ away?.name }} [{{
          away?.code
        }}]
      </span>
      <span v-if="frame">{{ frame.minute }}' - half {{ frame.half }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { kitUrl as kitImage } from '@/helpers/crest';
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import type {
  IMatchFrame,
  IMatchFramePlayer,
  IMatchEvent,
} from '@/utils/matchReplaySocket';
import { apiUrl } from '@/services/api';
import ballSprite from '@/assets/sprites/ball.png';
import homePlayerSprite from '@/assets/sprites/home-player.png';
import awayPlayerSprite from '@/assets/sprites/away-player.png';
import { getClubKitSprite } from '@/utils/clubKitSprite';

const homePlayerSpriteUrl = ref(`url('${homePlayerSprite}')`);
const awayPlayerSpriteUrl = ref(`url('${awayPlayerSprite}')`);

const DEFAULT_X_BLOCKS = 33;
const DEFAULT_Y_BLOCKS = 21;

const props = defineProps<{
  frame: IMatchFrame | null;
  home?: { name: string; code: string };
  away?: { name: string; code: string };
  /** id -> squad info, so tooltips can show a name/rating without bloating
   * every frame with data that never changes tick to tick. */
  players?: Record<
    string,
    { FirstName: string; LastName: string; Rating: number }
  >;
}>();

const hoveredId = ref<string | null>(null);

// A substituted-off player is never removed from the engine's StartingSquad
// (see the Substitutions feature's design doc) - it stays in every frame
// forever with matchStatus 'substituted', frozen at its last position. The
// incoming player spawns at that same spot, so rendering both produces a
// confusing frozen "ghost" stacked under the real player rather than a
// visible hand-off. Hiding the outgoing leg here is purely cosmetic - it
// changes nothing about StartingSquad/stats, which still (correctly) carry
// both legs.
const visiblePlayers = computed(
  () =>
    props.frame?.players?.filter((p) => p.matchStatus !== 'substituted') || []
);

const hoveredPlayer = computed(() => {
  if (!hoveredId.value || !props.frame) return null;

  const framePlayer = props.frame.players.find((p) => p.id === hoveredId.value);
  if (!framePlayer) return null;

  const info = props.players?.[framePlayer.id];

  return {
    ...framePlayer,
    name: info
      ? `${info.FirstName} ${info.LastName}`
      : `Player #${framePlayer.num}`,
    rating: info ? Math.round(info.Rating) : null,
  };
});

function toPct(pos: { x: number; y: number }) {
  return {
    left: `${(pos.x / (DEFAULT_X_BLOCKS - 1)) * 100}%`,
    top: `${(pos.y / (DEFAULT_Y_BLOCKS - 1)) * 100}%`,
  };
}

function toPctX(x: number): number {
  return (x / (DEFAULT_X_BLOCKS - 1)) * 100;
}

function toPctY(y: number): number {
  return (y / (DEFAULT_Y_BLOCKS - 1)) * 100;
}

const previousFrame = ref<IMatchFrame | null>(null);

function previousPlayerFrame(id: string) {
  return previousFrame.value?.players.find((p) => p.id === id);
}

// --- Position interpolation ---------------------------------------------
// The server (matchBroadcaster.ts's expandFrames()) already sends smoothly
// interpolated sub-frames sized to real ball/player speed, so there are no
// more full-pitch jumps to guess at here. This is just a thin residual
// smoother for ordinary socket/timer jitter between sub-frame deliveries:
// every render frame we interpolate each entity from where it was
// ("origin") to where the last server frame says it now is ("target"),
// using the ACTUALLY MEASURED time between the last two server frames
// rather than an assumed constant.
interface Vec {
  x: number;
  y: number;
}

interface AnimEntry {
  origin: Vec;
  target: Vec;
}

const BALL_ANIM_ID = '__ball__';
const animEntries = new Map<string, AnimEntry>();
const renderPositions = reactive<Record<string, Vec>>({});

let lastTickAt = 0;
let estimatedTickMs = 300;
const MIN_TICK_MS = 100;
const MAX_TICK_MS = 1000;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Where an entry actually is right now, given the in-flight lerp toward
 * its current target - used as the new origin when a fresher target
 * arrives mid-flight, so the object never jumps to catch up. */
function interpolatedNow(entry: AnimEntry, now: number): Vec {
  const t = Math.min(1, Math.max(0, (now - lastTickAt) / estimatedTickMs));
  return {
    x: lerp(entry.origin.x, entry.target.x, t),
    y: lerp(entry.origin.y, entry.target.y, t),
  };
}

function setTarget(id: string, raw: Vec, now: number) {
  const existing = animEntries.get(id);
  const origin = !existing ? raw : interpolatedNow(existing, now);

  animEntries.set(id, { origin, target: raw });
}

// --- Visual Action Callouts & Trajectory Vectors -----------------------
interface ActionCallout {
  id: string;
  playerId?: string;
  side: 'home' | 'away';
  text: string;
  icon: string;
  type: 'pass' | 'shot' | 'goal' | 'save' | 'tackle' | 'foul' | 'dribble';
  x: number;
  y: number;
  createdAt: number;
  expiresAt: number;
}

interface ActionVector {
  id: string;
  type: 'pass' | 'shot' | 'turnover';
  side: 'home' | 'away';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  createdAt: number;
  expiresAt: number;
}

const activeVectors = ref<ActionVector[]>([]);
const activeActions = ref<ActionCallout[]>([]);

let lastHolderId: string | null = null;
let lastHolderSide: 'home' | 'away' | null = null;
let lastHolderPos: { x: number; y: number } | null = null;
let lastHolderNum = '';
let nextActionId = 1;

function speedScale(): number {
  return Math.max(0.4, Math.min(1.2, estimatedTickMs / 300));
}

function getPlayerDisplayName(playerId: string, shirtNum?: string): string {
  const info = props.players?.[playerId];
  if (info) {
    return info.LastName || info.FirstName || `#${shirtNum ?? ''}`;
  }
  return shirtNum ? `#${shirtNum}` : 'Player';
}

function addActionCallout(action: Omit<ActionCallout, 'id' | 'createdAt'>) {
  const now = performance.now();
  const id = `act_${nextActionId++}`;
  if (activeActions.value.length >= 3) {
    activeActions.value.shift();
  }
  activeActions.value.push({
    ...action,
    id,
    createdAt: now,
  });
}

function addVector(vec: Omit<ActionVector, 'id' | 'createdAt'>) {
  const now = performance.now();
  const id = `vec_${nextActionId++}`;
  if (activeVectors.value.length >= 2) {
    activeVectors.value.shift();
  }
  activeVectors.value.push({
    ...vec,
    id,
    createdAt: now,
  });
}

function addPassAction(
  passerId: string,
  passerSide: 'home' | 'away',
  passerNum: string,
  fromPos: { x: number; y: number },
  receiver: IMatchFramePlayer
) {
  const duration = Math.round(1200 * speedScale());
  const now = performance.now();
  const receiverName = getPlayerDisplayName(receiver.id, receiver.num);

  addVector({
    type: 'pass',
    side: passerSide,
    fromX: toPctX(fromPos.x),
    fromY: toPctY(fromPos.y),
    toX: toPctX(receiver.x),
    toY: toPctY(receiver.y),
    expiresAt: now + duration,
  });

  addActionCallout({
    playerId: passerId,
    side: passerSide,
    text: `PASS → ${receiverName}`,
    icon: '⚡',
    type: 'pass',
    x: fromPos.x,
    y: fromPos.y,
    expiresAt: now + duration,
  });
}

function addTurnoverAction(
  prevHolderId: string,
  fromPos: { x: number; y: number },
  winner: IMatchFramePlayer
) {
  const duration = Math.round(1300 * speedScale());
  const now = performance.now();
  const winnerName = getPlayerDisplayName(winner.id, winner.num);
  const dist = Math.hypot(winner.x - fromPos.x, winner.y - fromPos.y);
  const isInterception = dist >= 2.5;

  addVector({
    type: 'turnover',
    side: winner.side,
    fromX: toPctX(fromPos.x),
    fromY: toPctY(fromPos.y),
    toX: toPctX(winner.x),
    toY: toPctY(winner.y),
    expiresAt: now + duration,
  });

  addActionCallout({
    playerId: winner.id,
    side: winner.side,
    text: isInterception ? `INTERCEPT (${winnerName})` : `TACKLE (${winnerName})`,
    icon: '🛑',
    type: 'tackle',
    x: winner.x,
    y: winner.y,
    expiresAt: now + duration,
  });
}

function handleFrameEvents(events: IMatchEvent[], frame: IMatchFrame) {
  const now = performance.now();
  const scale = speedScale();

  for (const ev of events) {
    if (ev.type === 'goal') {
      const shooter =
        frame.players.find((p) => p.id === ev.playerID) ??
        frame.players.find((p) => p.withBall) ??
        frame.players[0];
      const side =
        shooter?.side ??
        (ev.playerTeamID === props.home?.code ? 'home' : 'away');
      const goalX = side === 'home' ? 98 : 2;
      const goalY = 50;
      const name = shooter
        ? getPlayerDisplayName(shooter.id, shooter.num)
        : 'Goal';

      addVector({
        type: 'shot',
        side,
        fromX: shooter ? toPctX(shooter.x) : 50,
        fromY: shooter ? toPctY(shooter.y) : 50,
        toX: goalX,
        toY: goalY,
        expiresAt: now + Math.round(2000 * scale),
      });

      addActionCallout({
        playerId: shooter?.id,
        side,
        text: `GOAL! ${name}`,
        icon: '⚽',
        type: 'goal',
        x: shooter?.x ?? 16,
        y: shooter?.y ?? 10,
        expiresAt: now + Math.round(2500 * scale),
      });
    } else if (ev.type === 'save') {
      const shooter = frame.players.find((p) => p.id === ev.playerID);
      const shooterSide = shooter?.side ?? 'home';
      const keeper =
        frame.players.find((p) => p.pos === 'GK' && p.side !== shooterSide) ??
        frame.players.find((p) => p.pos === 'GK');
      const keeperName = keeper
        ? getPlayerDisplayName(keeper.id, keeper.num)
        : 'GK';
      const keeperSide =
        keeper?.side ?? (shooterSide === 'home' ? 'away' : 'home');

      if (shooter && keeper) {
        addVector({
          type: 'shot',
          side: shooterSide,
          fromX: toPctX(shooter.x),
          fromY: toPctY(shooter.y),
          toX: toPctX(keeper.x),
          toY: toPctY(keeper.y),
          expiresAt: now + Math.round(1500 * scale),
        });
      }

      addActionCallout({
        playerId: keeper?.id,
        side: keeperSide,
        text: `SAVE! ${keeperName}`,
        icon: '🧤',
        type: 'save',
        x: keeper?.x ?? 16,
        y: keeper?.y ?? 10,
        expiresAt: now + Math.round(2000 * scale),
      });
    } else if (ev.type === 'miss') {
      const shooter =
        frame.players.find((p) => p.id === ev.playerID) ??
        frame.players.find((p) => p.withBall);
      const side = shooter?.side ?? 'home';
      const name = shooter
        ? getPlayerDisplayName(shooter.id, shooter.num)
        : 'Shot';
      const goalX = side === 'home' ? 98 : 2;
      const goalY = 50 + (shooter ? (shooter.y < 10 ? -20 : 20) : 10);

      if (shooter) {
        addVector({
          type: 'shot',
          side,
          fromX: toPctX(shooter.x),
          fromY: toPctY(shooter.y),
          toX: goalX,
          toY: Math.max(10, Math.min(90, goalY)),
          expiresAt: now + Math.round(1400 * scale),
        });
      }

      addActionCallout({
        playerId: shooter?.id,
        side,
        text: ev.data?.blocked ? `BLOCKED (${name})` : `OFF TARGET (${name})`,
        icon: '🎯',
        type: 'shot',
        x: shooter?.x ?? 16,
        y: shooter?.y ?? 10,
        expiresAt: now + Math.round(1600 * scale),
      });
    } else if (ev.type === 'foul') {
      const offender = frame.players.find((p) => p.id === ev.playerID);
      const side = offender?.side ?? 'home';
      const name = offender
        ? getPlayerDisplayName(offender.id, offender.num)
        : 'Player';
      let text = `FOUL (${name})`;
      let icon = '⚠️';
      if (ev.data?.card === 'Red') {
        text = `RED CARD (${name})`;
        icon = '🟥';
      } else if (ev.data?.card === 'Yellow') {
        text = `YELLOW CARD (${name})`;
        icon = '🟨';
      }

      addActionCallout({
        playerId: offender?.id,
        side,
        text,
        icon,
        type: 'foul',
        x: offender?.x ?? 16,
        y: offender?.y ?? 10,
        expiresAt: now + Math.round(2200 * scale),
      });
    }
  }
}

function getMarkerEnd(v: ActionVector): string {
  if (v.type === 'pass') {
    return v.side === 'home' ? 'url(#arrow-pass-home)' : 'url(#arrow-pass-away)';
  }
  if (v.type === 'shot') {
    return 'url(#arrow-shot)';
  }
  return 'url(#arrow-turnover)';
}

function vectorOpacity(v: ActionVector): number {
  const now = performance.now();
  const remaining = v.expiresAt - now;
  const total = v.expiresAt - v.createdAt;
  if (remaining <= 0) return 0;
  const progress = 1 - remaining / total;
  if (progress < 0.6) return 0.95;
  return 0.95 * Math.max(0, 1 - (progress - 0.6) / 0.4);
}

function actionBadgeStyle(action: ActionCallout) {
  const pos =
    action.playerId && renderPositions[action.playerId]
      ? renderPositions[action.playerId]
      : { x: action.x, y: action.y };
  const leftPct = (pos.x / (DEFAULT_X_BLOCKS - 1)) * 100;
  const topPct = (pos.y / (DEFAULT_Y_BLOCKS - 1)) * 100;

  const now = performance.now();
  const remaining = action.expiresAt - now;
  const total = Math.max(1, action.expiresAt - action.createdAt);
  const progress = Math.max(0, Math.min(1, 1 - remaining / total));

  const translateY = -135 - progress * 18;
  const opacity =
    progress > 0.7 ? Math.max(0, 1 - (progress - 0.7) / 0.3) : 1;
  const scale = progress < 0.15 ? 0.75 + (progress / 0.15) * 0.25 : 1;

  return {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    transform: `translate(-50%, ${translateY}%) scale(${scale})`,
    opacity,
  };
}

watch(
  () => props.frame,
  (next: IMatchFrame | null, previous: IMatchFrame | null) => {
    if (!next) {
      animEntries.clear();
      for (const id of Object.keys(renderPositions)) delete renderPositions[id];
      previousFrame.value = null;
      lastTickAt = 0;
      estimatedTickMs = 300;
      activeActions.value = [];
      activeVectors.value = [];
      lastHolderId = null;
      lastHolderSide = null;
      lastHolderPos = null;
      lastHolderNum = '';
      return;
    }

    const now = performance.now();

    setTarget(BALL_ANIM_ID, next.ball, now);

    for (const p of next.players) {
      setTarget(p.id, { x: p.x, y: p.y }, now);
    }

    if (previous) {
      previousFrame.value = previous;
      estimatedTickMs = Math.min(
        MAX_TICK_MS,
        Math.max(MIN_TICK_MS, now - lastTickAt)
      );
    }
    lastTickAt = now;

    // Detect ball holder changes (pass or tackle/turnover)
    const currHolder = next.players.find((p) => p.withBall);
    if (currHolder) {
      if (lastHolderId && currHolder.id !== lastHolderId) {
        const isPass = currHolder.side === lastHolderSide;
        const fromPos = lastHolderPos ?? { x: currHolder.x, y: currHolder.y };
        const dist = Math.hypot(
          currHolder.x - fromPos.x,
          currHolder.y - fromPos.y
        );

        if (dist > 0.4) {
          if (isPass) {
            addPassAction(
              lastHolderId,
              lastHolderSide!,
              lastHolderNum,
              fromPos,
              currHolder
            );
          } else {
            addTurnoverAction(lastHolderId, fromPos, currHolder);
          }
        }
      }

      lastHolderId = currHolder.id;
      lastHolderSide = currHolder.side;
      lastHolderPos = { x: currHolder.x, y: currHolder.y };
      lastHolderNum = currHolder.num;
    }

    // Process discrete events (goals, saves, misses, fouls, cards)
    if (next.events?.length) {
      handleFrameEvents(next.events, next);
    }
  },
  { immediate: true }
);

let rafId: number | null = null;

function renderTick() {
  const now = performance.now();
  const t = Math.min(1, Math.max(0, (now - lastTickAt) / estimatedTickMs));

  for (const [id, entry] of animEntries) {
    renderPositions[id] = {
      x: lerp(entry.origin.x, entry.target.x, t),
      y: lerp(entry.origin.y, entry.target.y, t),
    };
  }

  // Prune expired visual callouts and trajectory vectors
  if (activeActions.value.some((a) => now > a.expiresAt)) {
    activeActions.value = activeActions.value.filter((a) => now <= a.expiresAt);
  }
  if (activeVectors.value.some((v) => now > v.expiresAt)) {
    activeVectors.value = activeVectors.value.filter((v) => now <= v.expiresAt);
  }

  rafId = requestAnimationFrame(renderTick);
}

onMounted(() => {
  rafId = requestAnimationFrame(renderTick);
});

onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
});

type PlayerAnimation = 'idle' | 'walk' | 'run' | 'dribble';

function getPlayerAnimation(p: IMatchFramePlayer): PlayerAnimation {
  const previous = previousPlayerFrame(p.id);

  if (!previous) {
    return p.withBall ? 'dribble' : 'idle';
  }

  const dx = p.x - previous.x;
  const dy = p.y - previous.y;

  const distance = Math.sqrt(dx * dx + dy * dy);

  if (p.withBall && distance > 0.1) {
    return 'dribble';
  }

  if (distance < 0.1) {
    return 'idle';
  }

  if (distance <= 1) {
    return 'walk';
  }

  return 'run';
}

type PlayerDirection = 'left' | 'right';

const playerDirections = new Map<string, PlayerDirection>();

function getPlayerDirection(p: IMatchFramePlayer): PlayerDirection {
  const previous = previousPlayerFrame(p.id);

  // Preserve the last direction while stationary
  if (!previous) {
    return playerDirections.get(p.id) ?? 'right';
  }

  const dx = p.x - previous.x;

  let direction = playerDirections.get(p.id) ?? 'right';

  // Only change facing when there is horizontal movement.
  // Vertical movement keeps the previous facing direction.
  if (dx > 0) {
    direction = 'right';
  } else if (dx < 0) {
    direction = 'left';
  }

  playerDirections.set(p.id, direction);

  return direction;
}

function kitUrl(side: 'home' | 'away') {
  const code = side === 'home' ? props.home?.code : props.away?.code;
  return kitImage(code);
}

for (const side of ['home', 'away'] as const) {
  watch(
    () => kitUrl(side),
    async (url, _previous, onCleanup) => {
      const sprite = side === 'home' ? homePlayerSpriteUrl : awayPlayerSpriteUrl;
      const fallback = side === 'home' ? homePlayerSprite : awayPlayerSprite;
      sprite.value = `url('${fallback}')`;
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      if (!url) return;
      try {
        const image = await getClubKitSprite(url);
        if (!cancelled) sprite.value = `url('${image}')`;
      } catch {
        // Keep the default kit when the asset is missing or CORS blocks it.
      }
    },
    { immediate: true }
  );
}

function playerStyle(p: IMatchFramePlayer) {
  return toPct(renderPositions[p.id] ?? p);
}

function ballStyle() {
  return toPct(renderPositions[BALL_ANIM_ID] ?? props.frame!.ball);
}
</script>

<style scoped>
.live-pitch {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pitch-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 33 / 21;
  background: repeating-linear-gradient(
    90deg,
    #1b4d33 0,
    #1b4d33 calc(100% / 12),
    #1f5539 calc(100% / 12),
    #1f5539 calc(100% / 6)
  );
  border: 2px solid rgba(255, 255, 255, 0.85);
  border-radius: 3px;
  overflow: hidden;
}

svg.markings {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
svg.markings line,
svg.markings circle,
svg.markings rect {
  stroke: rgba(255, 255, 255, 0.35);
  fill: none;
  stroke-width: 0.25;
  vector-effect: non-scaling-stroke;
}

.player {
  position: absolute;

  width: 5.2%;
  aspect-ratio: 1;

  transform: translate(-50%, -50%);

  z-index: 2;

  cursor: pointer;
}

.player-sprite {
  width: 48px;
  height: 48px;

  background-repeat: no-repeat;
  transform-origin: center;

  image-rendering: pixelated;
}

.dir-right {
  transform: scaleX(1);
}

.dir-left {
  transform: scaleX(-1);
}

.anim-idle {
  background-position-y: 0;
  animation: sprite-idle 1s steps(4) infinite;
}

.anim-walk {
  background-position-y: -48px;
  animation: sprite-walk 0.7s steps(4) infinite;
}

.anim-run {
  background-position-y: -96px;
  animation: sprite-run 0.4s steps(4) infinite;
}

.anim-dribble {
  background-position-y: -144px;
  animation: sprite-dribble 0.45s steps(4) infinite;
}

@keyframes sprite-idle {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

@keyframes sprite-walk {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

@keyframes sprite-run {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

@keyframes sprite-dribble {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -192px;
  }
}

.player.gk {
  filter: brightness(1.35);
}
.player.with-ball {
  box-shadow:
    0 0 0 3px #e9b34a,
    0 2px 6px rgba(0, 0, 0, 0.5);
}
.player.sent-off {
  opacity: 0.3;
}

.ball {
  position: absolute;

  width: 20px;
  height: 20px;

  transform: translate(-50%, -50%);

  background-repeat: no-repeat;
  background-size: 80px 20px;
  image-rendering: pixelated;
  border-radius: 50%;
  box-shadow:
    0 0 0 2px rgba(255, 230, 143, 0.9),
    0 2px 6px 2px rgba(0, 0, 0, 0.75);
  pointer-events: none;

  animation: ball-spin 400ms steps(4) infinite;

  z-index: 4;
}

@keyframes ball-spin {
  from {
    background-position-x: 0;
  }

  to {
    background-position-x: -80px;
  }
}
.player-tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 12px));
  background: rgba(12, 23, 16, 0.95);
  border: 1px solid #23392c;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 10;
}
.tooltip-name {
  font-weight: 700;
}
.tooltip-num {
  opacity: 0.6;
  font-weight: 400;
}
.tooltip-row {
  opacity: 0.85;
}
.tooltip-yellow {
  color: #e9b34a;
}
.tooltip-red {
  color: #ef4444;
}

.meta-line {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  opacity: 0.7;
}

/* Action Overlay & Vectors */
svg.action-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}

.action-vector-line {
  stroke-width: 0.55;
  stroke-dasharray: 2.5 1.5;
  animation: line-dash-flow 0.5s linear infinite;
  vector-effect: non-scaling-stroke;
}

.action-vector-line.pass.home {
  stroke: #38bdf8;
  filter: drop-shadow(0 0 2px rgba(56, 189, 248, 0.7));
}

.action-vector-line.pass.away {
  stroke: #fbbf24;
  filter: drop-shadow(0 0 2px rgba(251, 191, 36, 0.7));
}

.action-vector-line.shot {
  stroke: #f97316;
  stroke-width: 0.85;
  stroke-dasharray: 4 2;
  filter: drop-shadow(0 0 4px rgba(249, 115, 22, 0.9));
}

.action-vector-line.turnover {
  stroke: #ef4444;
  stroke-dasharray: 1.5 1.5;
  filter: drop-shadow(0 0 2px rgba(239, 68, 68, 0.6));
}

.action-target-ping {
  fill: none;
  stroke-width: 0.5;
  vector-effect: non-scaling-stroke;
  animation: ping-pulse 0.8s ease-out infinite;
}

.action-target-ping.pass.home {
  stroke: #38bdf8;
  fill: rgba(56, 189, 248, 0.25);
}

.action-target-ping.pass.away {
  stroke: #fbbf24;
  fill: rgba(251, 191, 36, 0.25);
}

.action-target-ping.shot {
  stroke: #f97316;
  fill: rgba(249, 115, 22, 0.35);
  r: 2.2;
}

.action-target-ping.turnover {
  stroke: #ef4444;
  fill: rgba(239, 68, 68, 0.25);
}

@keyframes line-dash-flow {
  from {
    stroke-dashoffset: 4;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes ping-pulse {
  0% {
    transform: scale(0.8);
    opacity: 1;
  }
  50% {
    transform: scale(1.4);
    opacity: 0.6;
  }
  100% {
    transform: scale(0.8);
    opacity: 1;
  }
}

/* Floating Player Action Badges */
.action-badge {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(12, 23, 16, 0.94);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
  pointer-events: none;
  z-index: 8;
  transition: opacity 0.15s ease-out;
}

.action-badge .badge-icon {
  font-size: 11px;
  line-height: 1;
}

.action-badge .badge-text {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #f1f5f9;
}

.action-badge.pass.home {
  border-color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.45), 0 4px 12px rgba(0, 0, 0, 0.6);
}
.action-badge.pass.home .badge-text {
  color: #7dd3fc;
}

.action-badge.pass.away {
  border-color: #fbbf24;
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.45), 0 4px 12px rgba(0, 0, 0, 0.6);
}
.action-badge.pass.away .badge-text {
  color: #fde68a;
}

.action-badge.shot {
  border-color: #f97316;
  background: rgba(35, 15, 8, 0.95);
  box-shadow: 0 0 12px rgba(249, 115, 22, 0.55), 0 4px 12px rgba(0, 0, 0, 0.6);
}
.action-badge.shot .badge-text {
  color: #fdba74;
}

.action-badge.goal {
  border-color: #22c55e;
  background: rgba(10, 36, 20, 0.96);
  box-shadow: 0 0 16px rgba(34, 197, 94, 0.65), 0 4px 14px rgba(0, 0, 0, 0.7);
  animation: badge-goal-pulse 0.6s ease-in-out infinite alternate;
}
.action-badge.goal .badge-text {
  color: #86efac;
  font-weight: 800;
}

@keyframes badge-goal-pulse {
  from {
    transform: translate(-50%, -140%) scale(1);
  }
  to {
    transform: translate(-50%, -140%) scale(1.08);
  }
}

.action-badge.save {
  border-color: #a855f7;
  background: rgba(28, 14, 40, 0.95);
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.55), 0 4px 12px rgba(0, 0, 0, 0.6);
}
.action-badge.save .badge-text {
  color: #d8b4fe;
}

.action-badge.tackle {
  border-color: #ef4444;
  background: rgba(36, 12, 16, 0.95);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.45), 0 4px 12px rgba(0, 0, 0, 0.6);
}
.action-badge.tackle .badge-text {
  color: #fca5a5;
}

.action-badge.foul {
  border-color: #eab308;
  box-shadow: 0 0 10px rgba(234, 179, 8, 0.45), 0 4px 12px rgba(0, 0, 0, 0.6);
}
.action-badge.foul .badge-text {
  color: #fef08a;
}
</style>
