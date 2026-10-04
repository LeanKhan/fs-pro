<template>
  <div class="hud">
    <!-- Identity: crest, Club Level, XP -->
    <div class="profile" @click="emit('act', 'club')">
      <div class="avatar"><img :src="`/club-icons/${club.code}.svg`" :alt="club.name" width="56" height="56" @error="crestFallback($event, club.name)" /></div>
      <div class="lvl-badge">{{ level.level }}</div>
      <div class="xpbar"><div :style="{ width: `${xpPct}%` }"></div><span>{{ level.xpInto }}/{{ level.xpNeed }}</span></div>
    </div>

    <div class="resbar">
      <div class="res" title="Treasury"><span v-html="icon('coins')"></span><b>{{ currency(stats.budget) }}</b></div>
      <div class="res" title="Fans"><span v-html="icon('people')"></span><b>{{ fmt(stats.fans) }}</b></div>
      <div class="res" title="Reputation"><span v-html="icon('star')"></span><b>{{ stats.reputation }}</b></div>
      <div class="res" title="Power"><span v-html="icon('bolt')"></span><b>{{ stats.power }}</b></div>
      <div v-if="stats.maxEntries" class="res" title="Competitions entered" @click="emit('act', 'competitions')">
        <span v-html="icon('trophy')"></span><b>{{ stats.entriesUsed }}/{{ stats.maxEntries }}</b>
      </div>
    </div>

    <!-- Date and the dashboard's facts -->
    <div class="datebar">
      <span class="chip"><b>{{ facts.day }}</b></span>
      <span v-if="facts.year" class="chip yearchip" :title="`Day ${facts.year.dayOfYear} of ${facts.year.yearLengthDays}`">
        Year {{ facts.year.currentYear }}
        <i class="yearbar"><i :style="{ width: `${(facts.year.dayOfYear / facts.year.yearLengthDays) * 100}%` }"></i></i>
      </span>
      <span class="chip">{{ club.location }} · Elo {{ Math.round(club.elo) }}</span>
      <span v-if="facts.next" class="chip" :class="{ today: facts.next.today }">
        Next: {{ facts.next.home ? 'vs' : '@' }} {{ facts.next.opponent }} · {{ facts.next.today ? 'today' : `day ${facts.next.day}` }}
        <button v-if="facts.next.today && !facts.next.home && isMine" class="btn tiny primary" @click="emit('act', 'travel')">Travel</button>
      </span>
      <span v-if="facts.performance?.expected" class="chip" title="Board performance score against its target">
        Board {{ facts.performance.score.toFixed(1) }} / {{ facts.performance.expected.toFixed(1) }}
      </span>
      <span v-if="facts.form.length" class="chip form">
        <i v-for="(r, i) in facts.form.slice(0, 5)" :key="i" :class="`res-${r.toLowerCase()}`">{{ r }}</i>
      </span>
      <span v-if="facts.fanApproval !== null" class="chip">Fan approval {{ Math.round(facts.fanApproval) }}%</span>
    </div>

    <div class="topright">
      <button v-if="isMine" class="roundbtn" title="Challenges" @click="emit('act', 'inbox')">
        <span v-html="icon('mail')"></span><i v-if="inbox" class="dot count">{{ inbox }}</i>
      </button>
      <button class="roundbtn" title="Competitions" @click="emit('act', 'competitions')" v-html="icon('trophy')"></button>
      <button v-if="isMine" class="roundbtn" title="Settings" @click="emit('act', 'settings')" v-html="icon('gear')"></button>
    </div>

    <!-- The active challenge, quest-style, and the manager's word -->
    <div v-if="challenge" class="quests">
      <div class="q-head"><span><span v-html="icon('star')"></span> Next Goal</span></div>
      <div class="q" :class="{ done: challenge.wins >= challenge.targetWins }">
        <span class="q-ic" v-html="icon('ball')"></span>
        <div class="q-body">
          <div class="q-title">{{ challenge.title }}</div>
          <div class="q-bar"><div :style="{ width: `${(challenge.wins / challenge.targetWins) * 100}%` }"></div></div>
          <div class="q-num">{{ challenge.wins }} / {{ challenge.targetWins }} wins · {{ formatClock(challenge.secondsLeft) }} left</div>
        </div>
      </div>
      <div class="q-reward">
        <div class="q-rlabel">Rewards</div>
        <div class="q-rlist">
          <span><span v-html="icon('coins')"></span>{{ currency(challenge.rewardCash) }}</span>
          <span><span v-html="icon('star')"></span>{{ challenge.rewardXP }} XP</span>
        </div>
      </div>
      <p v-if="briefing" class="briefing">“{{ briefing }}”</p>
    </div>

    <div v-if="builders" class="speedup">
      <div>
        <div class="su-title">{{ builders.name }}</div>
        <div class="su-time"><span v-html="icon('clock')"></span><span>{{ formatClock(builders.secondsLeft) }}</span></div>
      </div>
      <span class="su-count">{{ builders.active }}/{{ builders.max }} builders</span>
    </div>

    <div class="sidebtns">
      <button class="roundbtn big" title="Squad" @click="emit('act', 'squad')" v-html="icon('people')"></button>
      <button class="roundbtn big" title="Team Sheet" @click="emit('act', 'tactics')" v-html="icon('bag')"></button>
      <button class="roundbtn big" title="World" @click="emit('act', 'world')" v-html="icon('map')"></button>
    </div>

    <button class="worldbtn" @click="emit('act', 'world')"><span v-html="icon('map')"></span><span>World</span></button>

    <template v-if="isMine">
      <nav v-if="!moving" class="dock">
        <button @click="emit('act', 'build')"><span v-html="icon('hammer')"></span><span>Build</span></button>
        <button @click="emit('act', 'move')"><span v-html="icon('move')"></span><span>Move</span></button>
        <button @click="emit('act', 'squad')"><span v-html="icon('people')"></span><span>Squad</span></button>
        <button @click="emit('act', 'club')"><span v-html="icon('trophy')"></span><span>Club</span></button>
      </nav>
      <div v-else class="placebar">
        <button class="btn" @click="emit('act', 'move-cancel')"><span v-html="icon('close')"></span>Cancel</button>
        <button class="btn" @click="emit('act', 'move-rotate')"><span v-html="icon('rotate')"></span>Rotate</button>
        <button class="btn primary" @click="emit('act', 'move-save')"><span v-html="icon('check')"></span>Save layout</button>
      </div>
      <div v-if="!moving" class="playwrap">
        <label class="quicksim"><input type="checkbox" :checked="quickSim" @change="emit('update:quickSim', ($event.target as HTMLInputElement).checked)" /> Quick sim</label>
        <button class="playbtn" :class="{ tired: cooldown > 0 }" :disabled="playing" @click="emit('act', 'play')">
          <span v-html="icon('ball')"></span><span>PLAY</span>
          <small>{{ cooldown > 0 ? `Resting ${formatClock(cooldown)}` : playing ? 'Playing…' : 'Ready' }}</small>
        </button>
      </div>
    </template>
    <div v-else class="placebar">
      <button class="btn" @click="emit('act', 'home')">Back to my grounds</button>
      <button class="btn primary" @click="emit('act', 'challenge')">Challenge {{ club.name }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatClock } from '@/composables/use-club-game';
import { currency } from '@/helpers/misc';
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{
  club: { name: string; code: string; location: string; elo: number };
  level: { level: number; xpInto: number; xpNeed: number };
  stats: { budget: number; fans: number; reputation: number; power: number; entriesUsed: number; maxEntries: number | null };
  facts: {
    day: string;
    year: { currentYear: number; dayOfYear: number; yearLengthDays: number } | null;
    next: { opponent: string; home: boolean; day: number | null; today: boolean } | null;
    performance: { score: number; expected: number } | null;
    form: string[];
    fanApproval: number | null;
  };
  challenge: { title: string; wins: number; targetWins: number; secondsLeft: number; rewardCash: number; rewardXP: number } | null;
  briefing: string;
  builders: { name: string; secondsLeft: number; active: number; max: number } | null;
  inbox: number;
  isMine: boolean;
  moving: boolean;
  cooldown: number;
  playing: boolean;
  quickSim: boolean;
}>();
const emit = defineEmits<{ (e: 'act', action: string): void; (e: 'update:quickSim', v: boolean): void }>();

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const xpPct = computed(() => (props.level.xpNeed ? (props.level.xpInto / props.level.xpNeed) * 100 : 100));
</script>
