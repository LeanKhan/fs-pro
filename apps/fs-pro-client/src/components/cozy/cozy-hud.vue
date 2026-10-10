<template>
  <div class="hud">
    <!-- Identity: crest, Club Level, XP. Opens the Office. -->
    <div class="profile" title="Office" @click="emit('act', 'office')">
      <div class="avatar"><img :src="crestUrl(club.code)" :alt="club.name" width="56" height="56" @error="crestFallback($event, club.name)" /></div>
      <div class="lvl-badge">{{ level.level }}</div>
      <div class="xpbar"><div :style="{ width: `${xpPct}%` }"></div><span>{{ level.xpInto }}/{{ level.xpNeed }}</span></div>
    </div>

    <div class="resbar">
      <div class="res" :class="{ bump: cashBump }" title="Treasury" data-res="cash"><span v-html="icon('coins')"></span><b>{{ currency(stats.budget) }}</b></div>
      <div class="res" title="Fans"><span v-html="icon('people')"></span><b>{{ fmt(stats.fans) }}</b></div>
      <div class="res" title="Reputation"><span v-html="icon('star')"></span><b>{{ stats.reputation }}</b></div>
      <div class="res" title="Squad power"><span v-html="icon('bolt')"></span><b>{{ stats.power }}</b></div>
      <button
        v-if="league"
        class="res league-res"
        :class="[`d${Math.min(league.division, 5)}`, { coach: coach === 'league' }]"
        :title="`${league.poolName}: ${league.position ? ordinal(league.position) : 'unplaced'} of ${league.total}`"
        @click="emit('act', 'league')"
      >
        <span class="div-shield">{{ league.division }}</span>
        <b>{{ league.position ? ordinal(league.position) : '–' }}<small>/{{ league.total }}</small></b>
      </button>
    </div>

    <!-- The date, the next league match and the headline -->
    <div class="datebar">
      <span class="chip"><b>{{ facts.day }}</b></span>
      <span v-if="facts.year" class="chip yearchip" :title="`Day ${facts.year.dayOfYear} of ${facts.year.yearLengthDays}`">
        Year {{ facts.year.currentYear }}
        <i class="yearbar"><i :style="{ width: `${(facts.year.dayOfYear / facts.year.yearLengthDays) * 100}%` }"></i></i>
      </span>
      <button v-if="facts.next" class="chip nextchip" :class="{ today: facts.next.soon, coach: coach === 'prep' }" @click="emit('act', facts.next.league ? 'league' : 'next')">
        <span v-html="icon('ball')"></span>
        {{ facts.next.home ? 'vs' : '@' }} {{ facts.next.opponent }} ·
        <template v-if="facts.next.inSeconds !== null">{{ facts.next.inSeconds > 0 ? formatRemainingSeconds(facts.next.inSeconds) : 'now' }}</template>
        <template v-else>day {{ facts.next.day }}</template>
        <i v-if="facts.next.planSet === false" class="planflag" title="No match plan yet">Set plan!</i>
        <i v-else-if="facts.next.planSet" class="planflag ok" title="Match plan locked in">✓</i>
        <button v-if="facts.next.travel && isMine" class="btn tiny primary" @click.stop="emit('act', 'travel')">Travel</button>
      </button>
      <span v-if="facts.performance?.expected && facts.form.length >= 3" class="chip" :class="{ warnchip: boardPct < 80 }" :title="`Board performance score ${facts.performance.score.toFixed(1)} against a target of ${facts.performance.expected.toFixed(1)}`">
        Board {{ boardPct }}%
      </span>
      <span v-if="facts.form.length" class="chip formchip">
        <i v-for="(r, i) in facts.form.slice(0, 5)" :key="i" :class="`res-${r.toLowerCase()}`">{{ r }}</i>
      </span>
      <span v-if="headline" class="chip ticker" title="Around the world" @click="emit('act', 'news')"><span v-html="icon('news')"></span>{{ headline }}</span>
    </div>

    <button v-if="live" class="livebtn" @click="emit('act', 'watch-live')">
      <span class="livedot"></span><b>LIVE</b> {{ live.home ? 'vs' : '@' }} {{ live.opponent }} · Watch
    </button>

    <div class="topright">
      <button v-if="isMine" class="roundbtn" title="Challenges" @click="emit('act', 'inbox')">
        <span v-html="icon('mail')"></span><i v-if="inbox" class="dot count">{{ inbox }}</i>
      </button>
      <button class="roundbtn" title="League" :class="{ coach: coach === 'league' && !league }" @click="emit('act', 'league')" v-html="icon('trophy')"></button>
      <button v-if="isMine" class="roundbtn" title="Club hub" @click="emit('act', 'hub')" v-html="icon('hub')"></button>
      <button v-if="isMine" class="roundbtn" title="Settings" @click="emit('act', 'settings')" v-html="icon('gear')"></button>
    </div>

    <!-- First steps, then the standing challenge -->
    <div v-if="challenge || firstSteps?.length" class="quests" :class="{ folded }">
      <template v-if="firstSteps?.length">
        <div class="q-head" @click="folded = !folded">
          <span><span v-html="icon('check')"></span> First steps</span><small class="q-count">{{ firstSteps.filter((s) => s.done).length }}/{{ firstSteps.length }}</small>
        </div>
        <template v-if="!folded">
          <button
            v-for="s in firstSteps"
            :key="s.key"
            class="q step"
            :class="{ done: s.done, next: s.key === coach }"
            :disabled="s.done"
            @click="emit('act', s.key)"
          >
            <span class="q-ic" v-html="icon(s.done ? 'check' : s.icon)"></span>
            <span class="q-body"><span class="q-title">{{ s.label }}</span><span v-if="s.key === coach" class="q-num">{{ s.hint }}</span></span>
          </button>
        </template>
      </template>
      <template v-if="challenge && !firstSteps?.length">
        <div class="q-head" @click="folded = !folded"><span><span v-html="icon('star')"></span> Goal</span><small class="q-count">{{ challenge.wins }}/{{ challenge.targetWins }}</small></div>
        <template v-if="!folded">
          <div class="q" :class="{ done: challenge.wins >= challenge.targetWins }">
            <span class="q-ic" v-html="icon('ball')"></span>
            <div class="q-body">
              <div class="q-title">{{ challenge.title }}</div>
              <div class="q-bar"><div :style="{ width: `${(challenge.wins / challenge.targetWins) * 100}%` }"></div></div>
              <div class="q-num">{{ challenge.wins }} / {{ challenge.targetWins }} wins · {{ formatRemainingSeconds(challenge.secondsLeft) }} left</div>
            </div>
          </div>
          <div class="q-reward">
            <div class="q-rlist">
              <span><span v-html="icon('coins')"></span>{{ currency(challenge.rewardCash) }}</span>
              <span><span v-html="icon('star')"></span>{{ challenge.rewardXP }} XP</span>
            </div>
          </div>
          <p v-if="briefing" class="briefing">“{{ briefing }}”</p>
        </template>
      </template>
    </div>

    <div v-if="builders" class="speedup">
      <div>
        <div class="su-title">{{ builders.name }}</div>
        <div class="su-time"><span v-html="icon('clock')"></span><span>{{ formatRemainingSeconds(builders.secondsLeft) }}</span></div>
      </div>
      <span class="su-count">{{ builders.active }}/{{ builders.max }} builders</span>
    </div>

    <div class="sidebtns">
      <button class="roundbtn big" title="Squad" @click="emit('act', 'squad')" v-html="icon('people')"></button>
      <button class="roundbtn big" title="Team Sheet" @click="emit('act', 'tactics')" v-html="icon('bag')"></button>
      <button class="roundbtn big" title="World" :class="{ coach: coach === 'world' }" @click="emit('act', 'world')" v-html="icon('map')"></button>
    </div>

    <button class="worldbtn" :class="{ coach: coach === 'world' }" @click="emit('act', 'world')"><span v-html="icon('map')"></span><span>World</span></button>

    <template v-if="isMine">
      <nav v-if="!moving" class="dock">
        <button :class="{ coach: coach === 'build' }" @click="emit('act', 'build')"><span v-html="icon('hammer')"></span><span>Build</span></button>
        <button @click="emit('act', 'campus')"><span v-html="icon('coins')"></span><span>Grounds</span></button>
        <button @click="emit('act', 'move')"><span v-html="icon('move')"></span><span>Move</span></button>
        <button @click="emit('act', 'squad')"><span v-html="icon('people')"></span><span>Squad</span></button>
        <button :class="{ coach: coach === 'manager' }" @click="emit('act', 'manager')"><span v-html="icon('news')"></span><span>Manager</span></button>
      </nav>
      <div v-else class="placebar">
        <button class="btn" @click="emit('act', 'move-cancel')"><span v-html="icon('close')"></span>Cancel</button>
        <button class="btn" @click="emit('act', 'move-rotate')"><span v-html="icon('rotate')"></span>Rotate</button>
        <button class="btn primary" @click="emit('act', 'move-save')"><span v-html="icon('check')"></span>Save layout</button>
      </div>
      <div v-if="!moving" class="playwrap">
        <button class="playbtn" :class="{ tired: cooldown > 0, coach: coach === 'play' }" :disabled="playing" @click="emit('act', 'play')">
          <span v-html="icon('ball')"></span><span>PLAY</span>
          <small>{{ cooldown > 0 ? `Resting ${formatRemainingSeconds(cooldown)}` : playing ? 'Playing…' : quickSim ? 'Quick sim' : 'Ready' }}</small>
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
import { crestUrl } from '@/helpers/crest';
import { computed, ref, watch } from 'vue';
import { formatRemainingSeconds } from '@/helpers/countdown';
import { currency } from '@/helpers/misc';
import { crestFallback } from './club-colors';
import { icon } from './icons';

const props = defineProps<{
  club: { name: string; code: string };
  level: { level: number; xpInto: number; xpNeed: number };
  stats: { budget: number; fans: number; reputation: number; power: number };
  /** The HUD's league badge (the club's pyramid division and place). */
  league: { division: number; position: number | null; total: number; poolName: string } | null;
  facts: {
    day: string;
    year: { currentYear: number; dayOfYear: number; yearLengthDays: number } | null;
    next: { opponent: string; home: boolean; day: number | null; inSeconds: number | null; soon: boolean; league: boolean; travel: boolean; planSet?: boolean | null } | null;
    performance: { score: number; expected: number } | null;
    form: string[];
  };
  challenge: { title: string; wins: number; targetWins: number; secondsLeft: number; rewardCash: number; rewardXP: number } | null;
  /** A young club's checklist; each undone step is a shortcut (its key is an action). */
  firstSteps?: { key: string; label: string; hint: string; icon: string; done: boolean }[] | null;
  /** The action the onboarding pointer is on (the next first step). */
  coach?: string | null;
  briefing: string;
  /** The world headline currently shown in the date strip. */
  headline: string | null;
  builders: { name: string; secondsLeft: number; active: number; max: number } | null;
  inbox: number;
  isMine: boolean;
  moving: boolean;
  cooldown: number;
  playing: boolean;
  quickSim: boolean;
  /** A scheduled match of ours being broadcast right now. */
  live?: { opponent: string; home: boolean } | null;
}>();
const emit = defineEmits<{ (e: 'act', action: string): void }>();

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const xpPct = computed(() => (props.level.xpNeed ? (props.level.xpInto / props.level.xpNeed) * 100 : 100));
const boardPct = computed(() =>
  props.facts.performance?.expected ? Math.round((props.facts.performance.score / props.facts.performance.expected) * 100) : 100
);
function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// The treasury chip bumps whenever money comes in.
const cashBump = ref(false);
watch(
  () => props.stats.budget,
  (now, before) => {
    if (before === undefined || now <= before) return;
    cashBump.value = false;
    requestAnimationFrame(() => (cashBump.value = true));
    setTimeout(() => (cashBump.value = false), 450);
  }
);

// The quest card folds away on small screens unless onboarding needs it.
const folded = ref(typeof window !== 'undefined' && window.innerWidth < 760 && !props.firstSteps?.length);
</script>
