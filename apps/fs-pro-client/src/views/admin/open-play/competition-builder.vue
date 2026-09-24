<template>
  <v-container fluid class="competition-builder">
    <div class="d-flex align-center mb-4 ga-2">
      <v-btn icon="mdi-arrow-left" variant="text" size="small" to="/a/competitions" />
      <div class="text-h5 font-weight-bold">{{ isUpdate ? `Edit ${form.Name || 'competition'}` : 'New competition' }}</div>
      <v-spacer />
      <v-menu v-if="!isUpdate">
        <template #activator="{ props: p }">
          <v-btn v-bind="p" variant="tonal" prepend-icon="mdi-auto-fix">Start from a preset</v-btn>
        </template>
        <v-list density="compact">
          <v-list-item v-for="p in PRESETS" :key="p.key" :title="p.title" :subtitle="p.subtitle" @click="applyPreset(p.key)" />
        </v-list>
      </v-menu>
    </div>

    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
      <strong>{{ form.Name || 'This competition' }}:</strong> {{ summary }}
    </v-alert>

    <v-stepper v-model="step" :items="['Basics', 'Entry', 'Stages', 'Winning & rewards', 'Outcomes', 'Review']" alt-labels hide-actions>
      <template #item.1>
        <v-row dense>
          <v-col cols="12" md="6"><v-text-field v-model="form.Name" label="Name" variant="outlined" density="compact" placeholder="Summer Rumble" /></v-col>
          <v-col cols="6" md="3">
            <v-text-field v-model="form.Code" label="Code" variant="outlined" density="compact" :disabled="isUpdate" maxlength="12" hint="2–12 letters, unique" />
          </v-col>
          <v-col cols="6" md="3">
            <v-combobox v-model="form.Type" :items="['League', 'Cup', 'Event', 'Tournament']" label="Label" variant="outlined" density="compact" hint="Only a label" />
          </v-col>
          <v-col cols="12"><v-textarea v-model="form.Description" label="Description" variant="outlined" density="compact" rows="2" auto-grow /></v-col>
          <v-col cols="12" md="6">
            <div class="text-caption">Prestige (weights the board's view of results)</div>
            <v-rating v-model="form.Prestige" length="5" color="amber" hover density="compact" />
          </v-col>
          <v-col cols="12" md="6">
            <v-switch v-model="recurring" label="Repeats automatically" color="teal" density="compact" hide-details />
            <div v-if="recurring && form.Recurrence" class="d-flex ga-2 mt-2">
              <v-text-field v-model.number="form.Recurrence.everyDays" type="number" label="Every N days" density="compact" variant="outlined" />
              <v-text-field v-model.number="form.Recurrence.registrationDays" type="number" label="Registration days" density="compact" variant="outlined" />
            </div>
          </v-col>
        </v-row>
      </template>

      <template #item.2>
        <v-row dense>
          <v-col cols="12" md="4">
            <v-select v-model="form.Entry.mode" :items="[{ title: 'Open to eligible clubs', value: 'open' }, { title: 'Invitation only', value: 'invite' }]" label="Entry" density="compact" variant="outlined" />
          </v-col>
          <v-col cols="6" md="4"><v-text-field v-model.number="form.Entry.minClubs" type="number" label="Min clubs" density="compact" variant="outlined" /></v-col>
          <v-col cols="6" md="4"><v-text-field v-model.number="form.Entry.maxClubs" type="number" label="Max clubs" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="6" md="3"><v-text-field v-model.number="form.Entry.minLevel" type="number" label="Min Level" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="6" md="3"><v-text-field v-model.number="form.Entry.maxLevel" type="number" label="Max Level" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="6" md="3"><v-text-field v-model.number="form.Entry.minElo" type="number" label="Min Elo" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="6" md="3"><v-text-field v-model.number="form.Entry.maxElo" type="number" label="Max Elo" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="6" md="4"><v-text-field v-model.number="form.Entry.entryFee" type="number" label="Entry fee" prefix="€" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="6" md="4"><v-text-field v-model.number="form.Entry.lateEntryUntilDay" type="number" label="Late entry until day (of edition)" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="12" md="6">
            <v-autocomplete v-model="form.Entry.requiresWinOf" :items="otherCompetitions" label="Only winners of" multiple chips closable-chips density="compact" variant="outlined" />
          </v-col>
          <v-col cols="12" md="6">
            <v-autocomplete v-model="form.Entry.excludesEntrantsOf" :items="otherCompetitions" label="Not open to entrants of" multiple chips closable-chips density="compact" variant="outlined" />
          </v-col>
        </v-row>
      </template>

      <template #item.3>
        <div class="d-flex flex-column ga-3">
          <stage-editor
            v-for="(s, i) in form.Stages"
            :key="i"
            :stage="s"
            :index="i"
            :last="i === form.Stages.length - 1"
            :only="form.Stages.length === 1"
            @move="moveStage(i, $event)"
            @remove="form.Stages.splice(i, 1)"
          />
          <div>
            <v-btn variant="tonal" prepend-icon="mdi-plus" @click="addStage">Add stage</v-btn>
          </div>
        </div>
      </template>

      <template #item.4>
        <v-row dense>
          <v-col cols="12" md="4">
            <v-select v-model="form.WinCondition.type" :items="WIN_TYPES" label="How it's won" density="compact" variant="outlined" @update:model-value="onWinType" />
          </v-col>
          <v-col v-if="form.WinCondition.type === 'first-to'" cols="6" md="4">
            <v-select v-model="form.WinCondition.metric" :items="['points', 'wins', 'gf']" label="First to reach" density="compact" variant="outlined" />
          </v-col>
          <v-col v-if="form.WinCondition.type === 'first-to'" cols="6" md="4">
            <v-text-field v-model.number="form.WinCondition.target" type="number" label="Target" density="compact" variant="outlined" />
          </v-col>
          <v-col v-if="form.WinCondition.type === 'best-at-end'" cols="6" md="4">
            <v-select v-model="form.WinCondition.metric" :items="metricItems" label="Best" density="compact" variant="outlined" />
          </v-col>
        </v-row>
        <v-divider class="my-3" />
        <v-row dense>
          <v-col cols="12" md="6">
            <div class="text-subtitle-2 mb-1">Prize money by final Rank / round</div>
            <position-list v-model="form.Rewards.prizeMoney" prefix="€" />
          </v-col>
          <v-col cols="12" md="6">
            <div class="text-subtitle-2 mb-1">XP by final Rank / round</div>
            <position-list v-model="form.Rewards.xp" suffix="XP" />
          </v-col>
          <v-col cols="6" md="3"><v-text-field v-model.number="form.Rewards.participationFee" type="number" label="Paid to every entrant" prefix="€" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="6" md="3"><v-text-field v-model.number="form.Rewards.eloBonus" type="number" label="Winner Elo bonus" density="compact" variant="outlined" clearable /></v-col>
          <v-col cols="12" md="6"><v-text-field v-model="form.Rewards.trophy" label="Trophy name" density="compact" variant="outlined" clearable /></v-col>
        </v-row>
      </template>

      <template #item.5>
        <div class="text-caption text-medium-emphasis mb-3">
          Outcomes are how competitions stratify the world: qualify for or be barred from another competition, or move a Level up or down.
        </div>
        <div v-for="(o, i) in form.Outcomes" :key="i" class="d-flex ga-2 align-center flex-wrap mb-2">
          <v-select v-model="o.type" :items="OUTCOME_TYPES" density="compact" variant="outlined" hide-details style="max-width: 200px" />
          <v-text-field v-model.number="o.positions[0]" type="number" label="From rank" density="compact" variant="outlined" hide-details style="max-width: 110px" />
          <v-text-field v-model.number="o.positions[1]" type="number" label="To rank" density="compact" variant="outlined" hide-details style="max-width: 110px" />
          <v-select v-if="o.type === 'level'" v-model="o.change" :items="[{ title: 'Level up', value: 1 }, { title: 'Level down', value: -1 }]" density="compact" variant="outlined" hide-details style="max-width: 160px" />
          <v-select v-else v-model="o.targetCompetitionId" :items="otherCompetitionIds" label="Competition" density="compact" variant="outlined" hide-details style="max-width: 240px" />
          <v-text-field v-if="o.type === 'bar'" v-model.number="o.editions" type="number" label="Editions" density="compact" variant="outlined" hide-details style="max-width: 110px" />
          <v-btn icon="mdi-delete" size="small" variant="text" color="red-lighten-2" @click="form.Outcomes.splice(i, 1)" />
        </div>
        <v-btn variant="tonal" prepend-icon="mdi-plus" @click="form.Outcomes.push({ type: 'qualify', positions: [1, 1], targetCompetitionId: '' })">Add outcome</v-btn>
      </template>

      <template #item.6>
        <v-progress-linear v-if="validating" indeterminate color="teal" class="mb-2" />
        <v-alert v-if="errors.length" type="error" variant="tonal" density="compact" class="mb-3">
          <div v-for="e in errors" :key="e.path + e.message"><code>{{ e.path }}</code> {{ e.message }}</div>
        </v-alert>
        <v-alert v-else-if="validated" type="success" variant="tonal" density="compact" class="mb-3">Ready to save.</v-alert>
        <div class="text-body-1 mb-2">{{ summary }}</div>
        <v-expansion-panels>
          <v-expansion-panel title="Definition (with defaults)">
            <v-expansion-panel-text><pre class="text-caption">{{ JSON.stringify(validated ?? payload, null, 2) }}</pre></v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </template>
    </v-stepper>

    <div class="d-flex ga-2 mt-4">
      <v-btn variant="text" :disabled="step === 1" @click="step--">Back</v-btn>
      <v-spacer />
      <span v-if="saveError" class="text-red align-self-center text-caption">{{ saveError }}</span>
      <v-btn v-if="step < 6" color="indigo" variant="flat" @click="next">Next</v-btn>
      <v-btn v-else color="teal" variant="flat" :loading="saving" :disabled="!!errors.length || !form.Name || (!isUpdate && !form.Code)" @click="save">
        {{ isUpdate ? 'Save changes' : 'Create competition' }}
      </v-btn>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CompetitionSummary } from '@repo/api-contract';
import StageEditor, { type EditableStage } from '@/components/open-play/builder/stage-editor.vue';
import PositionList from '@/components/open-play/builder/position-list.vue';
import { client } from '@/services/api';
import { unwrap } from '@/store/open-play';
import { METRIC_LABELS, formatSummary } from '@/helpers/open-play';

/** Admin competition builder (spec "UI → Admin competition builder"): a
 * stepper with presets, a plain-English summary, and server validation. */
const props = withDefaults(defineProps<{ isUpdate?: boolean }>(), { isUpdate: false });
const route = useRoute();
const router = useRouter();

type Outcome = { type: 'qualify' | 'bar' | 'level'; positions: [number, number]; targetCompetitionId?: string; editions?: number; change?: 1 | -1 };
type Pos = { position: number; amount: number };
type Form = {
  Name: string;
  Code: string;
  Type: string;
  Description: string;
  Prestige: number;
  Entry: Record<string, unknown> & { mode: 'open' | 'invite'; minClubs: number; maxClubs: number | null; requiresWinOf?: string[]; excludesEntrantsOf?: string[] };
  Stages: EditableStage[];
  WinCondition: { type: 'final-stage' | 'first-to' | 'best-at-end' | 'last-standing'; metric?: string; target?: number };
  Rewards: { prizeMoney: Pos[]; xp: Pos[]; participationFee?: number | null; eloBonus?: number | null; trophy?: string | null };
  Outcomes: Outcome[];
  Recurrence: { everyDays: number; registrationDays: number } | null;
};

const blank = (): Form => ({
  Name: '',
  Code: '',
  Type: 'League',
  Description: '',
  Prestige: 2,
  Entry: { mode: 'open', minClubs: 4, maxClubs: null },
  Stages: [{ type: 'league', days: 30, rules: {} }],
  WinCondition: { type: 'final-stage' },
  Rewards: { prizeMoney: [], xp: [] },
  Outcomes: [],
  Recurrence: null,
});

const form = reactive<Form>(blank());
const step = ref(1);
const recurring = ref(false);
const competitions = ref<CompetitionSummary[]>([]);
const validated = ref<unknown>(null);
const errors = ref<{ path: string; message: string }[]>([]);
const validating = ref(false);
const saving = ref(false);
const saveError = ref('');

const metricItems = Object.entries(METRIC_LABELS).map(([value, title]) => ({ value, title }));
const WIN_TYPES = [
  { title: 'The final stage decides', value: 'final-stage' },
  { title: 'First to a target', value: 'first-to' },
  { title: 'Best at the end', value: 'best-at-end' },
  { title: 'Last club standing', value: 'last-standing' },
];
const OUTCOME_TYPES = [
  { title: 'Qualify for', value: 'qualify' },
  { title: 'Barred from', value: 'bar' },
  { title: 'Level change', value: 'level' },
];

const PRESETS = [
  { key: 'league', title: 'Open league', subtitle: '30-day league, ranked by points per game' },
  { key: 'cup', title: 'Classic cup', subtitle: '16 clubs, single-leg knockout' },
  { key: 'groups', title: 'Groups + knockout', subtitle: 'Groups of 4, top 2 into a knockout' },
  { key: 'sprint', title: 'Sprint', subtitle: 'First to 10 wins' },
  { key: 'rumble', title: 'Summer Rumble', subtitle: 'Most goals scored in 14 days' },
] as const;

function applyPreset(key: (typeof PRESETS)[number]['key']) {
  const b = blank();
  if (key === 'league') {
    Object.assign(b, {
      Name: 'Open League',
      Stages: [{ type: 'league', days: 30, rules: { metric: 'ppg' } }],
      Rewards: { prizeMoney: [{ position: 1, amount: 50000 }, { position: 2, amount: 25000 }], xp: [{ position: 1, amount: 300 }, { position: 2, amount: 150 }] },
    });
  } else if (key === 'cup') {
    Object.assign(b, {
      Name: 'Classic Cup',
      Type: 'Cup',
      Entry: { mode: 'open', minClubs: 4, maxClubs: 16 },
      Stages: [{ type: 'knockout', legs: 1, tieDays: 4, seeding: 'elo', drawAtEnd: 'penalties' }],
      Rewards: { prizeMoney: [{ position: 1, amount: 80000 }], xp: [{ position: 1, amount: 400 }] },
    });
  } else if (key === 'groups') {
    Object.assign(b, {
      Name: 'Champions Series',
      Type: 'Tournament',
      Prestige: 4,
      Entry: { mode: 'open', minClubs: 8, maxClubs: 16 },
      Stages: [
        { type: 'groups', days: 21, groupSize: 4, rules: {}, advance: { top: 2, perGroup: true } },
        { type: 'knockout', legs: 2, tieDays: 6, seeding: 'previous-stage', drawAtEnd: 'penalties' },
      ],
      Rewards: { prizeMoney: [{ position: 1, amount: 150000 }, { position: 2, amount: 60000 }], xp: [{ position: 1, amount: 600 }] },
    });
  } else if (key === 'sprint') {
    Object.assign(b, {
      Name: 'Sprint',
      Type: 'Event',
      Stages: [{ type: 'league', days: 21, rules: { metric: 'wins', minGamesToRank: 0 } }],
      WinCondition: { type: 'first-to', metric: 'wins', target: 10 },
    });
  } else {
    Object.assign(b, {
      Name: 'Summer Rumble',
      Type: 'Event',
      Stages: [{ type: 'league', days: 14, rules: { metric: 'gf', minGamesToRank: 3 } }],
      WinCondition: { type: 'best-at-end', metric: 'gf' },
      Rewards: { prizeMoney: [{ position: 1, amount: 30000 }], xp: [{ position: 1, amount: 200 }] },
    });
  }
  Object.assign(form, b, { Code: form.Code });
}

const otherCompetitions = computed(() =>
  competitions.value.filter((c) => c.id !== route.params.id).map((c) => ({ title: `${c.name} (${c.code})`, value: c.code }))
);
const otherCompetitionIds = computed(() =>
  competitions.value.filter((c) => c.id !== route.params.id).map((c) => ({ title: `${c.name} (${c.code})`, value: c.id }))
);

watch(recurring, (on) => {
  form.Recurrence = on ? (form.Recurrence ?? { everyDays: 60, registrationDays: 7 }) : null;
});

function onWinType(t: Form['WinCondition']['type']) {
  form.WinCondition = t === 'first-to' ? { type: t, metric: 'points', target: 30 } : t === 'best-at-end' ? { type: t, metric: 'points' } : { type: t };
}
function addStage() {
  form.Stages.push({ type: 'knockout', legs: 1, tieDays: 4, seeding: 'previous-stage', drawAtEnd: 'penalties' });
}
function moveStage(i: number, dir: number) {
  const j = i + dir;
  const [s] = form.Stages.splice(i, 1);
  form.Stages.splice(j, 0, s!);
}

/** Drop blanks so the server fills its defaults. */
function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) continue;
      if (v === null && k !== 'maxClubs' && k !== 'Recurrence') continue;
      if (Array.isArray(v) && !v.length && ['requiresWinOf', 'excludesEntrantsOf', 'countryIds', 'Outcomes'].includes(k)) continue;
      out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

const payload = computed(() => {
  const { Code: _code, ...rest } = clean(JSON.parse(JSON.stringify(form)) as Form);
  return rest;
});
const summary = computed(() => formatSummary(payload.value as Parameters<typeof formatSummary>[0]));

async function validate() {
  validating.value = true;
  try {
    const r = unwrap<{ ok: boolean; definition: unknown; errors: { path: string; message: string }[] }>(
      await client.competitionDefinitions.validate.mutation({ body: payload.value as never })
    );
    errors.value = r.errors;
    validated.value = r.ok ? r.definition : null;
  } catch (err) {
    errors.value = [{ path: '', message: err instanceof Error ? err.message : String(err) }];
    validated.value = null;
  } finally {
    validating.value = false;
  }
}

function next() {
  step.value++;
  if (step.value === 6) void validate();
}

async function save() {
  saving.value = true;
  saveError.value = '';
  try {
    const saved = props.isUpdate
      ? unwrap<CompetitionSummary>(
          await client.competitionDefinitions.update.mutation({ params: { id: String(route.params.id) }, body: payload.value as never })
        )
      : unwrap<CompetitionSummary>(
          await client.competitionDefinitions.create.mutation({ body: { ...(payload.value as object), Code: form.Code.toUpperCase() } as never })
        );
    await router.push(`/a/competitions/${saved.id}/${saved.code}`);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    competitions.value = unwrap<CompetitionSummary[]>(await client.competitionDefinitions.list.query({ query: {} }));
  } catch {
    competitions.value = [];
  }
  if (props.isUpdate) {
    const c = competitions.value.find((x) => x.id === route.params.id);
    const def = (c?.definition ?? {}) as Partial<Form>;
    Object.assign(form, blank(), JSON.parse(JSON.stringify(def)), {
      Name: c?.name ?? def.Name ?? '',
      Code: c?.code ?? '',
      Type: c?.type ?? 'League',
      Description: c?.description ?? '',
      Outcomes: def.Outcomes ?? [],
      Recurrence: def.Recurrence ?? null,
    });
    form.Rewards.prizeMoney ??= [];
    form.Rewards.xp ??= [];
    recurring.value = !!form.Recurrence;
  }
});
</script>
