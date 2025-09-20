<template>
  <v-dialog
    :model-value="show"
    @update:model-value="$emit('update:show', $event)"
    height="500px"
    width="650px"
    overlay-opacity="0.6"
  >
    <v-card height="100%" tile :loading="!allReady">
      <v-toolbar color="green accent-3" dense flat tile>
        <v-toolbar-title class="mx-auto">Get ready to play!</v-toolbar-title>
      </v-toolbar>
      <v-card-text class="pa-0">
        <v-row>
          <v-col :class="{ yellow: player1Ready }">
            <v-card flat tile dense class="pa-0 justify-center text-center">
              <v-img
                v-if="home"
                contain
                class="mx-auto"
                :src="`${api}/img/clubs/kits/${home.ClubCode}-kit.png`"
              
                max-width="200px"
              ></v-img>
              <v-overlay :absolute="true" :model-value="true" opacity="0.3">
            
              <div class="headline">
                {{ home.Name }}
              </div>
              <v-card-text class="pa-0">
                <span v-if="!player1Ready">Are you ready?</span>

                 
                <template v-else>
                  Oya na!
                  <v-icon>
                    mdi-check
                  </v-icon>
                </template>
              </v-card-text>
              <v-card-actions class="justify-center">
                
                  <v-btn
                    color="accent"
                    :depressed="player1Ready"
                                        :class="{ 'darken-2': player1Ready }"
                    @click="player1Ready = !player1Ready"
                  >
                    READY
                  </v-btn>
              
              </v-card-actions>
              </v-overlay>
            </v-card>
          </v-col>
          <v-col :class="{ yellow: player2Ready }">
            <v-card flat tile dense class="pa-0 justify-center text-center">
              <v-img
                v-if="away"
                contain
                class="mx-auto"
                :src="`${api}/img/clubs/kits/${away.ClubCode}-kit.png`"
              
                max-width="200px"
              ></v-img>
              <v-overlay :absolute="true" :model-value="true" opacity="0.3">
            
             <div class="headline">
                {{ away.Name }}
              </div>
              <v-card-text class="pa-0">
<span v-if="!player2Ready">Are you ready?</span>

                 
                <template v-else>
                  Oya na!
                  <v-icon>
                    mdi-check
                  </v-icon>
                </template>              </v-card-text>
              <v-card-actions class="justify-center">
               
                  <v-btn
                    color="accent"
                    :depressed="player2Ready"
                    :class="{ 'darken-2': player2Ready }"
                    @click="player2Ready = !player2Ready"
                  >
                    READY
                  </v-btn>
                
              </v-card-actions>
              </v-overlay>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { apiUrl } from '@/store';

interface Props {
  show: boolean;
  home: any;
  away: any;
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
});

const emit = defineEmits<{
  'update:show': [value: boolean];
  'all-ready': [];
}>();

const player1Ready = ref(false);
const player2Ready = ref(false);
const skip = ref(false);
const api = ref(apiUrl);

const allReady = computed(() => {
  return player1Ready.value && player2Ready.value;
});

watch(allReady, (ready: boolean) => {
  if (ready) {
    console.log('All are ready!');
    emit('all-ready');
  }
}, { immediate: true });
</script>
