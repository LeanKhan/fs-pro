<template>
  <div class="bracket-view">
    <div v-if="!bracket || !bracket.rounds.length" class="text-center text-medium-emphasis py-6">
      <v-icon size="40">mdi-tournament</v-icon>
      <div class="mt-1">The draw has not been made yet</div>
    </div>
    <div v-else class="bv-rounds d-flex ga-4 overflow-x-auto pb-2">
      <div v-for="r in bracket.rounds" :key="r.round" class="bv-round d-flex flex-column">
        <div class="text-caption text-uppercase font-weight-bold text-medium-emphasis mb-2">
          {{ roundName(r.round, totalRounds) }}
        </div>
        <div class="d-flex flex-column justify-space-around flex-grow-1 ga-3">
          <v-card
            v-for="(tie, i) in r.ties"
            :key="i"
            variant="tonal"
            class="bv-tie pa-2"
            :class="{ 'bv-mine': isMine(tie.highSeedClubId) || isMine(tie.lowSeedClubId) }"
          >
            <div
              v-for="side in [tie.highSeedClubId, tie.lowSeedClubId]"
              :key="side"
              class="d-flex align-center ga-2 bv-side"
              :class="{ 'bv-winner': tie.winnerId === side, 'bv-out': tie.winnerId && tie.winnerId !== side }"
            >
              <club-crest :code="dir.code(side)" :size="20" />
              <span class="flex-grow-1 text-truncate">{{ dir.name(side) }}</span>
              <span class="font-weight-bold">{{ aggregate(tie, side) }}</span>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">
              <template v-if="tie.winnerId">
                {{ tie.decidedBy ? `Decided by ${tie.decidedBy}` : 'Decided' }}
              </template>
              <template v-else-if="tie.playBy != null">Play by day {{ tie.playBy }}</template>
              <template v-if="tie.legs.length > 1"> · {{ tie.legs.length }} legs</template>
            </div>
          </v-card>
          <v-card v-if="r.byeClubId" variant="outlined" class="pa-2 text-caption">
            <club-crest :code="dir.code(r.byeClubId)" :size="18" class="mr-1" />
            {{ dir.name(r.byeClubId) }} — bye
          </v-card>
        </div>
      </div>
      <div v-if="champion" class="bv-round d-flex flex-column justify-center align-center">
        <v-icon color="amber" size="48">mdi-trophy</v-icon>
        <div class="font-weight-bold mt-1">{{ dir.name(champion) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Bracket } from '@repo/api-contract';
import ClubCrest from './club-crest.vue';
import { roundName, useClubDirectory } from '@/helpers/open-play';

type Tie = Bracket['rounds'][number]['ties'][number];

const props = withDefaults(defineProps<{ bracket: Bracket | null; highlightClubId?: string | null; clubsIn?: number }>(), {
  highlightClubId: null,
  clubsIn: 0,
});

const dir = useClubDirectory();
const totalRounds = computed(() => {
  const n = props.clubsIn || (props.bracket?.rounds[0]?.ties.length ?? 0) * 2;
  return Math.max(props.bracket?.rounds.length ?? 0, n > 1 ? Math.ceil(Math.log2(n)) : 1);
});
const champion = computed(() => {
  const last = props.bracket?.rounds.at(-1);
  if (!last || last.ties.length !== 1 || props.bracket!.rounds.length < totalRounds.value) return null;
  return last.ties[0]!.winnerId;
});
const isMine = (id: string) => !!props.highlightClubId && id === props.highlightClubId;

function aggregate(tie: Tie, clubId: string) {
  const played = tie.legs.filter((l) => l.played);
  if (!played.length) return '';
  return played.reduce((sum, l) => sum + ((l.homeClubId === clubId ? l.homeGoals : l.awayGoals) ?? 0), 0);
}
</script>

<style scoped>
.bv-round {
  min-width: 220px;
  max-width: 260px;
}
.bv-mine {
  outline: 2px solid rgba(63, 81, 181, 0.8);
}
.bv-winner {
  font-weight: 700;
}
.bv-out {
  opacity: 0.55;
}
.bv-side {
  line-height: 1.8;
}
</style>
