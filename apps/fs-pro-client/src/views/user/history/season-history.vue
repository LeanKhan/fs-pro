<template>
  <div class="season-history">
    <v-card class="mb-4" :loading="loading">
      <v-card-title class="d-flex align-center flex-wrap gap-2">
        <v-icon color="amber">mdi-history</v-icon>
        <span>Season History</span>
        <v-spacer />
        <v-select
          v-if="reports.length"
          v-model="selectedYear"
          :items="reports.map((r) => r.year)"
          label="Season cycle"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 220px"
        />
      </v-card-title>
      <v-card-subtitle v-if="report">
        What changed when {{ report.year }} ended
        <span class="text-medium-emphasis">
          · {{ formatDate(report.generatedAt) }}
        </span>
      </v-card-subtitle>
    </v-card>

    <v-alert v-if="!loading && !reports.length" type="info" variant="tonal">
      No season cycle has been ended yet. A summary appears here after an admin
      ends a cycle.
    </v-alert>

    <template v-if="report">
      <!-- Highlights -->
      <v-card class="mb-4">
        <v-card-title class="d-flex align-center gap-2">
          <v-icon color="amber">mdi-star-four-points</v-icon>
          Highlights
        </v-card-title>
        <v-list density="comfortable" class="bg-transparent">
          <v-list-item
            v-for="h in visibleHighlights"
            :key="h.id"
            :title="h.title"
            :subtitle="h.detail"
          >
            <template #prepend>
              <v-avatar size="36" :color="typeStyle(h.type).color" variant="tonal" class="mr-3">
                <v-icon size="20">{{ typeStyle(h.type).icon }}</v-icon>
              </v-avatar>
            </template>
            <template #append>
              <v-chip size="x-small" :color="typeStyle(h.type).color" variant="tonal">
                {{ typeStyle(h.type).label }}
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
        <v-card-actions v-if="report.highlights.length > HIGHLIGHT_LIMIT">
          <v-btn variant="text" size="small" @click="showAllHighlights = !showAllHighlights">
            {{ showAllHighlights ? 'Show fewer' : `Show all ${report.highlights.length}` }}
          </v-btn>
        </v-card-actions>
      </v-card>

      <v-row>
        <!-- Champions -->
        <v-col cols="12" md="6">
          <v-card height="100%">
            <v-card-title>Champions</v-card-title>
            <v-list density="compact" class="bg-transparent">
              <v-list-item v-for="c in report.competitions" :key="c.code">
                <template #prepend>
                  <competition-badge :fixture="{ LeagueCode: c.code }" class="mr-3" />
                </template>
                <v-list-item-title>
                  {{ c.championName ?? 'No champion recorded' }}
                </v-list-item-title>
                <v-list-item-subtitle>{{ c.name }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Promotions & relegations -->
        <v-col cols="12" md="6">
          <v-card height="100%">
            <v-card-title>Promotions &amp; Relegations</v-card-title>
            <v-list v-if="report.movements.length" density="compact" class="bg-transparent">
              <v-list-item v-for="m in report.movements" :key="m.clubId + m.direction">
                <template #prepend>
                  <v-icon
                    :color="m.direction === 'promoted' ? 'success' : 'error'"
                    class="mr-3"
                  >
                    {{ m.direction === 'promoted' ? 'mdi-arrow-up-bold' : 'mdi-arrow-down-bold' }}
                  </v-icon>
                </template>
                <v-list-item-title>{{ m.clubName }}</v-list-item-title>
                <v-list-item-subtitle>{{ m.from }} → {{ m.to }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-medium-emphasis">
              No club changed league this season.
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Breakouts -->
        <v-col cols="12" md="6">
          <v-card height="100%">
            <v-card-title>Breakout Players</v-card-title>
            <v-list v-if="report.breakouts.length" density="compact" class="bg-transparent">
              <v-list-item v-for="b in report.breakouts" :key="b.playerId">
                <v-list-item-title>{{ b.name }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ [b.position, b.clubCode, b.age != null ? `age ${b.age}` : null].filter(Boolean).join(' · ') }}
                </v-list-item-subtitle>
                <template #append>
                  <v-chip size="small" color="success" variant="tonal">
                    {{ Math.round(b.oldRating) }} → {{ Math.round(b.newRating) }}
                    (+{{ Math.round(b.delta) }})
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-medium-emphasis">
              No standout progress this season.
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Retirements -->
        <v-col cols="12" md="6">
          <v-card height="100%">
            <v-card-title>Retirements</v-card-title>
            <v-list v-if="report.retirements.length" density="compact" class="bg-transparent">
              <v-list-item v-for="r in report.retirements" :key="r.playerId">
                <v-list-item-title>{{ r.name }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ [r.position, r.clubCode, r.age != null ? `age ${r.age}` : null].filter(Boolean).join(' · ') }}
                </v-list-item-subtitle>
                <template #append>
                  <v-chip v-if="r.rating != null" size="small" variant="tonal">
                    {{ Math.round(r.rating) }}
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-medium-emphasis">
              Nobody retired this season.
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { client } from '@/services/api';
import type { SeasonReport } from '@repo/api-contract';
import CompetitionBadge from '@/components/calendar/competition-badge.vue';

const route = useRoute();

const HIGHLIGHT_LIMIT = 8;

const loading = ref(true);
const reports = ref<SeasonReport[]>([]);
const selectedYear = ref<string>('');
const showAllHighlights = ref(false);

const report = computed(
  () => reports.value.find((r) => r.year === selectedYear.value) ?? null
);

const visibleHighlights = computed(() => {
  const all = report.value?.highlights ?? [];
  return showAllHighlights.value ? all : all.slice(0, HIGHLIGHT_LIMIT);
});

const TYPE_STYLE: Record<string, { icon: string; color: string; label: string }> = {
  champion: { icon: 'mdi-trophy', color: 'amber', label: 'Champions' },
  'cup-winner': { icon: 'mdi-trophy-award', color: 'amber-darken-2', label: 'Cup' },
  'continental-winner': { icon: 'mdi-star-shooting', color: 'cyan', label: 'Continental' },
  promotion: { icon: 'mdi-arrow-up-bold', color: 'success', label: 'Promoted' },
  relegation: { icon: 'mdi-arrow-down-bold', color: 'error', label: 'Relegated' },
  retirement: { icon: 'mdi-account-arrow-right', color: 'blue-grey', label: 'Retired' },
  breakout: { icon: 'mdi-rocket-launch', color: 'purple-accent-2', label: 'Breakout' },
};

function typeStyle(type: string) {
  return TYPE_STYLE[type] ?? { icon: 'mdi-information', color: 'grey', label: type };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

watch(selectedYear, () => {
  showAllHighlights.value = false;
});

onMounted(async () => {
  try {
    const res = await client.calendar.getSeasonReports.query();
    if (res.status === 200) {
      reports.value = res.body.payload;
      const requested = route.query.year as string | undefined;
      selectedYear.value =
        reports.value.find((r) => r.year === requested)?.year ??
        reports.value[0]?.year ??
        '';
    }
  } catch (error) {
    console.error('Error fetching season reports:', error);
  } finally {
    loading.value = false;
  }
});
</script>
