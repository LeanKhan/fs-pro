<template>
  <v-card class="world-settings-card" :loading="loading">
    <v-card-title class="d-flex align-center ga-2">
      <v-icon color="teal">mdi-earth</v-icon>
      World
      <v-chip v-if="settings" size="small" variant="tonal">Year {{ settings.currentYear }} · day {{ settings.dayOfYear }} of {{ settings.yearLengthDays }}</v-chip>
      <v-spacer />
      <v-btn size="small" variant="tonal" :loading="busy === 'day'" @click="advance">Advance one day</v-btn>
      <v-btn size="small" color="warning" variant="tonal" :loading="busy === 'year'" @click="confirmEnd = true">End year now</v-btn>
    </v-card-title>
    <v-card-text v-if="settings">
      <year-progress :settings="settings" class="mb-4" />
      <v-alert v-if="lastReport" type="info" variant="tonal" density="compact" class="mb-3">{{ lastReport }}</v-alert>
      <v-row dense>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="form.yearLengthDays" type="number" label="Year length (days)" density="compact" variant="outlined" hint="Drives ageing, wages, youth intake, reports" persistent-hint />
        </v-col>
        <v-col cols="6" md="3">
          <v-text-field v-model.number="form.maxConcurrentEntries" type="number" label="Max entries per club" density="compact" variant="outlined" />
        </v-col>
        <v-col cols="12" md="6">
          <v-switch v-model="form.autoRollover" label="Roll the year over automatically" color="teal" density="compact" hide-details />
        </v-col>
      </v-row>

      <div class="text-subtitle-2 mt-3 mb-1">Transfer windows (days of the year)</div>
      <div v-for="(w, i) in form.transferWindows" :key="i" class="d-flex ga-2 align-center mb-1">
        <v-text-field v-model.number="w.fromDay" type="number" label="From" density="compact" variant="outlined" hide-details style="max-width: 120px" />
        <v-text-field v-model.number="w.toDay" type="number" label="To" density="compact" variant="outlined" hide-details style="max-width: 120px" />
        <v-btn icon="mdi-close" size="x-small" variant="text" @click="form.transferWindows.splice(i, 1)" />
      </div>
      <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="form.transferWindows.push({ fromDay: 1, toDay: 14 })">Add window</v-btn>

      <div class="text-subtitle-2 mt-3 mb-1">Level</div>
      <v-row dense>
        <v-col cols="4" md="2"><v-text-field v-model.number="xp.win" type="number" label="XP per win" density="compact" variant="outlined" /></v-col>
        <v-col cols="4" md="2"><v-text-field v-model.number="xp.draw" type="number" label="XP per draw" density="compact" variant="outlined" /></v-col>
        <v-col cols="4" md="2"><v-text-field v-model.number="xp.loss" type="number" label="XP per loss" density="compact" variant="outlined" /></v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="thresholdsText"
            label="XP for each Level (comma separated, from Level 0)"
            density="compact"
            variant="outlined"
            hint="Blank = 100 × Level²"
            persistent-hint
          />
        </v-col>
        <v-col cols="12" md="4">
          <v-switch v-model="review.enabled" label="Year-end Level review" color="teal" density="compact" hide-details />
        </v-col>
        <v-col cols="6" md="4"><v-text-field v-model.number="review.promoteCount" type="number" label="Promote per Level" density="compact" variant="outlined" :disabled="!review.enabled" /></v-col>
        <v-col cols="6" md="4"><v-text-field v-model.number="review.relegateCount" type="number" label="Relegate per Level" density="compact" variant="outlined" :disabled="!review.enabled" /></v-col>
      </v-row>

      <div class="d-flex justify-end ga-2 mt-2">
        <span v-if="message" class="text-caption align-self-center" :class="failed ? 'text-red' : 'text-teal'">{{ message }}</span>
        <v-btn color="teal" variant="flat" :loading="busy === 'save'" @click="save">Save world settings</v-btn>
      </div>
    </v-card-text>

    <v-dialog v-model="confirmEnd" max-width="420">
      <v-card>
        <v-card-title>End year {{ settings?.currentYear }}?</v-card-title>
        <v-card-text>
          Players age and may retire, wages are paid, youth arrives, the year report is written and Level reviews run. Competitions
          are not touched.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmEnd = false">Cancel</v-btn>
          <v-btn color="warning" variant="flat" @click="endYear">End year</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { WorldDayReport, WorldSettings, WorldSettingsPatch, YearEndSummary } from '@repo/api-contract';
import YearProgress from './year-progress.vue';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';

/** Admin world settings: the year, transfer windows, entry cap and Level. */
const emit = defineEmits<{ (e: 'changed'): void }>();

const settings = ref<WorldSettings | null>(null);
const loading = ref(false);
const busy = ref<string | null>(null);
const message = ref('');
const failed = ref(false);
const lastReport = ref('');
const confirmEnd = ref(false);
const form = reactive({ yearLengthDays: 365, maxConcurrentEntries: 3, autoRollover: true, transferWindows: [] as { fromDay: number; toDay: number }[] });
const xp = reactive({ win: 30, draw: 15, loss: 5 });
const review = reactive({ enabled: false, promoteCount: 0, relegateCount: 0 });
const thresholdsText = ref('');

async function load() {
  loading.value = true;
  try {
    const s = unwrap<WorldSettings>(await client.world.getSettings.query());
    settings.value = s;
    Object.assign(form, {
      yearLengthDays: s.yearLengthDays,
      maxConcurrentEntries: s.maxConcurrentEntries,
      autoRollover: s.autoRollover,
      transferWindows: s.transferWindows.map((w) => ({ ...w })),
    });
    if (s.xpPerMatch) Object.assign(xp, s.xpPerMatch);
    if (s.levelReview) Object.assign(review, s.levelReview);
    thresholdsText.value = s.levelThresholds?.join(', ') ?? '';
  } catch (err) {
    failed.value = true;
    message.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

function report(msg: string, bad = false) {
  message.value = msg;
  failed.value = bad;
}

async function save() {
  busy.value = 'save';
  try {
    const t = thresholdsText.value.trim();
    const patch: WorldSettingsPatch = {
      ...form,
      xpPerMatch: { ...xp },
      levelReview: { ...review },
      levelThresholds: t ? t.split(/[\s,]+/).filter(Boolean).map(Number) : null,
    };
    settings.value = unwrap<WorldSettings>(await client.world.updateSettings.mutation({ body: patch }));
    report('Saved');
    emit('changed');
  } catch (err) {
    report(err instanceof Error ? err.message : String(err), true);
  } finally {
    busy.value = null;
  }
}

async function advance() {
  busy.value = 'day';
  try {
    const r = unwrap<WorldDayReport>(await client.world.advanceDay.mutation({ body: {} }));
    lastReport.value = r.pausedForYearEnd
      ? 'The year is over and auto-rollover is off: end the year to continue.'
      : `Day ${r.day}: ${r.matches.simulated} matches played` +
        (r.ai ? `, AI ${r.ai.registered} entries / ${r.ai.proposed} challenges` : '') +
        (r.challenges?.forfeited ? `, ${r.challenges.forfeited} forfeits` : '') +
        (r.yearEnded ? `, year ${r.yearEnded.label} ended` : '');
    await load();
    emit('changed');
  } catch (err) {
    report(err instanceof Error ? err.message : String(err), true);
  } finally {
    busy.value = null;
  }
}

async function endYear() {
  confirmEnd.value = false;
  busy.value = 'year';
  try {
    const r = unwrap<YearEndSummary>(await client.world.endYear.mutation({ body: {} }));
    lastReport.value = `Year ${r.label} ended: ${r.retired} retired, ${r.levelReviewMoves} Level moves${r.errors.length ? `, ${r.errors.length} errors` : ''}`;
    await load();
    emit('changed');
  } catch (err) {
    report(err instanceof Error ? err.message : String(err), true);
  } finally {
    busy.value = null;
  }
}

onMounted(load);
</script>
