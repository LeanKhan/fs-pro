<template>
  <div class="news">
    <slot />
    <p v-if="!feed" class="sub">Fetching the papers…</p>
    <template v-else>
      <section>
        <h4>{{ category === 'transfer' ? 'Latest transfers' : feed.local?.name ? `News from ${feed.local.name}` : 'Headlines' }} · Day {{ feed.currentDay }}</h4>
        <article v-for="h in headlines" :key="h.id" class="headline">
          <span class="tag" :class="`cat-${h.category}`">{{ h.tag ?? h.category }}</span>
          <b>{{ h.title }}</b>
          <p>{{ h.summary }}</p>
          <small>{{ h.timestamp }}</small>
        </article>
        <p v-if="!headlines.length" class="sub">Nothing to report yet.</p>
      </section>
      <template v-if="!category">
        <section v-if="feed.recentResults.length">
          <h4>Results</h4>
          <div v-for="r in feed.recentResults" :key="r.fixtureId" class="result-row">
            <span>{{ r.home }}</span><b>{{ r.homeScore }} - {{ r.awayScore }}</b><span>{{ r.away }}</span>
            <small v-if="r.isUpset" class="tag cat-result">upset</small>
          </div>
        </section>
        <section v-if="feed.activeInjuries.length">
          <h4>Treatment table</h4>
          <div v-for="i in feed.activeInjuries" :key="i.playerId" class="result-row">
            <span>{{ i.name }} ({{ i.club }})</span><small>{{ i.type }} · {{ i.daysRemaining }} days</small>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WorldFeed } from '@repo/api-contract';

/** The world feed as a newspaper: all of it at the newsstand, transfers only on the billboard. */
const props = defineProps<{ feed: WorldFeed | null; category?: 'transfer' }>();
const headlines = computed(() => (props.feed?.headlines ?? []).filter((h) => !props.category || h.category === props.category));
</script>
