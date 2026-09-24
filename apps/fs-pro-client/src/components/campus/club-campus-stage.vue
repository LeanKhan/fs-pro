<template>
  <div class="campus-stage-viewport position-relative overflow-hidden">
    <!-- Base Campus Illustration -->
    <div class="campus-canvas-container">
      <img
        src="/campus-base.jpg"
        alt="Club Campus"
        class="campus-background-image"
        draggable="false"
      />

      <!-- Interactive Facility Hotspot Pins -->
      <div
        v-for="pin in pins"
        :key="pin.key"
        class="facility-pin position-absolute cursor-pointer"
        :style="{ top: `${pin.top}%`, left: `${pin.left}%` }"
        @click="$emit('select-facility', pin.key)"
      >
        <div class="pin-badge d-flex align-center gap-1.5 px-2.5 py-1 rounded-pill">
          <span class="pin-icon">{{ pin.icon }}</span>
          <div class="d-flex flex-column text-left">
            <span class="pin-title text-caption font-weight-bold">{{ pin.title }}</span>
            <span class="pin-level text-caption">Level {{ pin.level }}</span>
          </div>
          <div v-if="pin.isUpgrading" class="pin-spinner ml-1">
            <v-progress-circular indeterminate size="14" width="2" color="amber"></v-progress-circular>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface FacilityPin {
  key: string;
  title: string;
  icon: string;
  level: number;
  top: number;
  left: number;
  isUpgrading?: boolean;
}

withDefaults(
  defineProps<{
    pins?: FacilityPin[];
  }>(),
  {
    pins: () => [
      { key: 'stands', title: 'Stadium', icon: '🏟️', level: 0, top: 15, left: 55 },
      { key: 'training_ground', title: 'Training Ground', icon: '🦺', level: 0, top: 23, left: 31 },
      { key: 'main_office', title: 'Main Office', icon: '💼', level: 0, top: 36, left: 48 },
      { key: 'youth_academy', title: 'Academy', icon: '🎓', level: 0, top: 41, left: 70 },
      { key: 'scouting', title: 'Scouting', icon: '🔭', level: 0, top: 48, left: 27 },
      { key: 'medical_centre', title: 'Medical Centre', icon: '➕', level: 0, top: 59, left: 43 },
      { key: 'staff_house', title: 'Staff House', icon: '👥', level: 0, top: 58, left: 60 },
    ],
  }
);

defineEmits<{
  (e: 'select-facility', key: string): void;
}>();
</script>

<style scoped>
.campus-stage-viewport {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  background-color: #0b0f19;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
}

.campus-canvas-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.campus-background-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.facility-pin {
  transform: translate(-50%, -50%);
  z-index: 10;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.facility-pin:hover {
  transform: translate(-50%, -58%) scale(1.08);
  z-index: 15;
}

.pin-badge {
  background: rgba(12, 19, 34, 0.88);
  backdrop-filter: blur(10px);
  border: 1.5px solid rgba(255, 255, 255, 0.2);
  color: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 10px rgba(99, 102, 241, 0.25);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.facility-pin:hover .pin-badge {
  border-color: #ffd700;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8), 0 0 16px rgba(255, 215, 0, 0.5);
  background: rgba(15, 23, 42, 0.95);
}

.pin-icon {
  font-size: 1.1rem;
}

.pin-title {
  font-size: 0.76rem;
  letter-spacing: 0.02em;
  color: #ffffff;
}

.pin-level {
  font-size: 0.68rem;
  color: #94a3b8;
}

.pin-spinner {
  display: flex;
  align-items: center;
}
</style>
