<template>
  <v-card class="facilities-quick-list pa-3 border" rounded="lg" :style="glassStyle">
    <div class="d-flex justify-space-between align-center mb-2 cursor-pointer" @click="collapsed = !collapsed">
      <span class="text-caption font-weight-bold text-white text-uppercase">Club Facilities</span>
      <v-icon size="18" color="grey-lighten-1">{{ collapsed ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
    </div>

    <v-expand-transition>
      <v-list v-show="!collapsed" density="compact" bg-color="transparent" class="pa-0">
        <v-list-item
          v-for="item in facilityItems"
          :key="item.key"
          class="facility-row px-2 mb-1 rounded-lg"
          min-height="44"
          @click="$emit('select-facility', item.key)"
        >
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption font-weight-medium text-white">{{ item.name }}</span>
            <span class="text-caption text-medium-emphasis">Lv {{ item.level }}</span>
          </div>
          <v-progress-linear
            :model-value="item.progress"
            :color="item.isUpgrading ? 'indigo-lighten-2' : 'grey-darken-2'"
            bg-color="rgba(255,255,255,0.08)"
            height="4"
            rounded
          ></v-progress-linear>
        </v-list-item>
      </v-list>
    </v-expand-transition>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';

export interface QuickFacilityItem {
  key: string;
  name: string;
  icon: string;
  level: number;
  progress: number;
  isUpgrading: boolean;
}

withDefaults(
  defineProps<{
    facilityItems?: QuickFacilityItem[];
  }>(),
  {
    facilityItems: () => [
      { key: 'stands', name: 'Stadium', icon: '🏟️', level: 0, progress: 0, isUpgrading: false },
      { key: 'training_ground', name: 'Training Ground', icon: '🦺', level: 0, progress: 0, isUpgrading: false },
      { key: 'youth_academy', name: 'Academy', icon: '🎓', level: 0, progress: 0, isUpgrading: false },
      { key: 'medical_centre', name: 'Medical Centre', icon: '➕', level: 0, progress: 0, isUpgrading: false },
      { key: 'scouting', name: 'Scouting', icon: '🔭', level: 0, progress: 0, isUpgrading: false },
      { key: 'staff_house', name: 'Staff House', icon: '💼', level: 0, progress: 0, isUpgrading: false },
    ],
  }
);

defineEmits<{ (e: 'select-facility', key: string): void }>();

const collapsed = ref(false);
const glassStyle = {
  background: 'linear-gradient(135deg, rgba(30, 34, 53, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%)',
  borderColor: 'rgba(99, 102, 241, 0.3)',
  width: '210px',
};
</script>

<style scoped>
.facilities-quick-list {
  pointer-events: auto;
}
.facility-row {
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: background 0.2s ease;
}
.facility-row:hover {
  background: rgba(99, 102, 241, 0.12);
}
</style>
