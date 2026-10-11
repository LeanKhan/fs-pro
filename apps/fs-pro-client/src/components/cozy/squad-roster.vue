<template>
  <section class="roster">
    <header class="ro-head">
      <div>
        <h3>Players <small>{{ players.length }}</small></h3>
        <p class="sub">Your squad, line by line. New players come up from the Youth Academy.</p>
      </div>
      <button v-if="!readOnly" class="btn primary" :disabled="promoting" @click="promote">
        <span v-html="icon('up')"></span>
        {{ promoting ? 'Promoting…' : 'Promote from academy' }}
      </button>
    </header>
    <p v-if="note" class="warn" :class="{ good: noteGood }">{{ note }}</p>

    <div v-for="line in lines" :key="line.pos" class="ro-line">
      <h4>{{ line.label }} <small>{{ line.players.length }}</small></h4>
      <p v-if="!line.players.length" class="sub">Nobody here yet.</p>
      <ul>
        <li v-for="p in line.players" :key="p.id" :class="{ hurt: p.injuredDays > 0 }">
          <img class="face" :src="faceUrl(p.id)" alt="" width="40" height="40" loading="lazy" @error="hideImg" />
          <div class="who">
            <b>{{ p.name }}</b>
            <small>
              Age {{ p.age }}
              <template v-if="p.isYouth"> · Academy</template>
              <template v-if="p.injuredDays > 0"> · Injured {{ p.injuredDays }}d</template>
            </small>
          </div>
          <span class="rating" :title="`Rating ${p.rating}`">{{ p.rating }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { client, apiUrl } from '@/services/api';
import { icon } from './icons';

/**
 * The squad roster (the Squad drawer's Players tab): every signed player by
 * line, and the Youth Academy promotion that supplies new ones. Replaces the
 * old Vuetify squad zone and its transfer-market selling, which is retired for
 * launch (CLAUDE.md).
 */
const props = defineProps<{ club: any | null; readOnly?: boolean }>();
const emit = defineEmits<{ (e: 'changed'): void; (e: 'toast', text: string, level?: 'success' | 'error'): void }>();

interface Row {
  id: string;
  name: string;
  pos: string;
  age: number;
  rating: number;
  isYouth: boolean;
  injuredDays: number;
}

const players = computed<Row[]>(() =>
  ((props.club?.Players ?? []) as any[])
    .filter((p) => p.isSigned !== false && !p.isRetired)
    .map((p) => ({
      id: String(p._id),
      name: `${p.FirstName ?? ''} ${p.LastName ?? ''}`.trim(),
      pos: String(p.Position ?? 'MID'),
      age: Number(p.Age ?? 0),
      rating: Math.round(Number(p.Rating ?? 0)),
      isYouth: !!p.isYouth,
      injuredDays: Number(p.Injury?.daysRemaining ?? 0),
    }))
    .sort((a, b) => b.rating - a.rating)
);

const LINES = [
  { pos: 'GK', label: 'Goalkeepers' },
  { pos: 'DEF', label: 'Defenders' },
  { pos: 'MID', label: 'Midfielders' },
  { pos: 'ATT', label: 'Attackers' },
];
const lines = computed(() => LINES.map((l) => ({ ...l, players: players.value.filter((p) => p.pos === l.pos) })));

const faceUrl = (id: string) => `${apiUrl}/api/players/${encodeURIComponent(id)}/face`;
const hideImg = (e: Event) => ((e.target as HTMLImageElement).style.visibility = 'hidden');

const promoting = ref(false);
const note = ref('');
const noteGood = ref(false);
async function promote() {
  const id = props.club?._id;
  if (!id || promoting.value) return;
  promoting.value = true;
  note.value = '';
  try {
    const res = await client.clubs.recruitYouthPlayers.mutation({ params: { id }, body: { count: 1 } });
    if (res.status === 200 && res.body.payload?.length) {
      const p = res.body.payload[0];
      note.value = `${p.FirstName} ${p.LastName} (${p.Position}, ${p.Age}) joins from the academy!`;
      noteGood.value = true;
      emit('toast', note.value);
      emit('changed');
    } else {
      // The server says why: no academy yet, the cooldown, or a full squad.
      note.value = res.status === 200 ? 'No one is ready to step up yet.' : res.body.message;
      noteGood.value = false;
    }
  } catch {
    note.value = 'Could not reach the academy. Try again.';
    noteGood.value = false;
  } finally {
    promoting.value = false;
  }
}
</script>

<style scoped>
.roster {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ro-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.ro-head h3 {
  margin: 0;
}
.ro-head h3 small,
.ro-line h4 small {
  color: var(--muted);
  font-weight: 600;
}
.ro-line h4 {
  margin: 4px 0 6px;
}
.ro-line ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
}
.ro-line li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 6px;
  border-radius: 12px;
  background: #fff8e6;
  border: 2px solid #e2cc9c;
}
.ro-line li.hurt {
  border-color: #e9a0a0;
  background: #fff1ef;
}
.face {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #f1dfb6;
  flex: none;
}
.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.who b {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.who small {
  color: var(--muted);
  font-size: 12px;
}
.rating {
  flex: none;
  min-width: 34px;
  text-align: center;
  padding: 3px 6px;
  border-radius: 8px;
  background: var(--wood-d, #5e3b22);
  color: #fff;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
