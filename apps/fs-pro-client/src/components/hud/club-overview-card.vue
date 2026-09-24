<template>
  <v-card class="club-overview-card pa-3 border" rounded="lg" :style="glassStyle">
    <div class="d-flex justify-space-between align-center mb-2 cursor-pointer" @click="collapsed = !collapsed">
      <span class="text-caption font-weight-bold text-white text-uppercase">Club Overview</span>
      <v-icon size="18" color="grey-lighten-1">{{ collapsed ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
    </div>

    <v-expand-transition>
      <v-list v-show="!collapsed" density="compact" bg-color="transparent" class="pa-0">
        <v-list-item class="px-0" min-height="30">
          <template #prepend>
            <v-icon size="16" color="indigo-lighten-2">mdi-soccer</v-icon>
          </template>
          <v-list-item-title class="text-caption text-medium-emphasis">Club Level</v-list-item-title>
          <template #append>
            <span class="text-body-2 font-weight-bold text-white">{{ level }}</span>
          </template>
        </v-list-item>
        <v-list-item class="px-0" min-height="30">
          <template #prepend>
            <v-icon size="16" color="success">mdi-cash-multiple</v-icon>
          </template>
          <v-list-item-title class="text-caption text-medium-emphasis">Squad Value</v-list-item-title>
          <template #append>
            <span class="text-body-2 font-weight-bold text-white">{{ formatCurrency(squadValue) }}</span>
          </template>
        </v-list-item>
        <v-list-item class="px-0" min-height="30">
          <template #prepend>
            <v-icon size="16" color="blue-lighten-2">mdi-account-group</v-icon>
          </template>
          <v-list-item-title class="text-caption text-medium-emphasis">Fans</v-list-item-title>
          <template #append>
            <span class="text-body-2 font-weight-bold text-white">{{ fans.toLocaleString() }}</span>
          </template>
        </v-list-item>
        <v-list-item class="px-0" min-height="30">
          <template #prepend>
            <v-icon size="16" color="amber">mdi-star</v-icon>
          </template>
          <v-list-item-title class="text-caption text-medium-emphasis">Reputation</v-list-item-title>
          <template #append>
            <span class="text-body-2 font-weight-bold text-white">{{ reputation }}</span>
          </template>
        </v-list-item>
        <v-list-item v-if="fanApproval !== null" class="px-0" min-height="30">
          <template #prepend>
            <v-icon size="16" :color="fanApproval >= 60 ? 'success' : fanApproval >= 35 ? 'amber' : 'error'">mdi-heart</v-icon>
          </template>
          <v-list-item-title class="text-caption text-medium-emphasis">Fan Approval</v-list-item-title>
          <template #append>
            <span class="text-body-2 font-weight-bold text-white">{{ fanApproval }}%</span>
          </template>
        </v-list-item>
        <v-list-item v-if="form.length" class="px-0" min-height="30">
          <template #prepend>
            <v-icon size="16" color="grey-lighten-1">mdi-chart-timeline-variant</v-icon>
          </template>
          <v-list-item-title class="text-caption text-medium-emphasis">Form</v-list-item-title>
          <template #append>
            <span class="d-flex gap-1">
              <span v-for="(r, i) in form" :key="i" class="form-pip" :class="`form-${r}`">{{ r }}</span>
            </span>
          </template>
        </v-list-item>
        <v-divider class="my-1" opacity="0.08"></v-divider>
        <v-list-item class="px-0" min-height="30">
          <template #prepend>
            <v-icon size="16" color="indigo-lighten-1">mdi-sword-cross</v-icon>
          </template>
          <v-list-item-title class="text-caption text-medium-emphasis">Team Power</v-list-item-title>
          <template #append>
            <span class="text-body-2 font-weight-bold text-indigo-lighten-2">{{ power }}</span>
          </template>
        </v-list-item>
      </v-list>
    </v-expand-transition>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { currency } from '@/helpers/misc';

withDefaults(
  defineProps<{
    level?: number;
    squadValue?: number;
    fans?: number;
    reputation?: number;
    power?: number;
    /** 0-100, null to hide. */
    fanApproval?: number | null;
    /** Most recent first. */
    form?: ('W' | 'D' | 'L')[];
  }>(),
  { level: 0, squadValue: 80000, fans: 120, reputation: 3, power: 180, fanApproval: null, form: () => [] }
);

const collapsed = ref(false);
const formatCurrency = (val: number) => currency(val);
const glassStyle = {
  background: 'linear-gradient(135deg, rgba(30, 34, 53, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
  borderColor: 'rgba(99, 102, 241, 0.3)',
  width: '220px',
};
</script>

<style scoped>
.club-overview-card {
  pointer-events: auto;
}
.form-pip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
}
.form-W {
  background: #2e7d32;
}
.form-D {
  background: #757575;
}
.form-L {
  background: #c62828;
}
:deep(.v-list-item__prepend) {
  margin-right: 8px;
}
</style>
