<template>
  <v-row class="challenges-zone">
    <v-col cols="12" md="7">
      <v-card class="pa-3">
        <div class="d-flex align-center mb-2">
          <div class="text-subtitle-1 font-weight-bold">Challenges</div>
          <v-spacer />
          <v-btn color="teal" variant="flat" size="small" prepend-icon="mdi-sword-cross" @click="dialog = true">
            Challenge a club
          </v-btn>
        </div>
        <challenge-inbox />
      </v-card>
    </v-col>
    <v-col cols="12" md="5">
      <challenge-policy-form v-if="store.clubId" :club-id="store.clubId" class="mb-4" />
      <entry-policy-form v-if="store.clubId" :club-id="store.clubId" />
    </v-col>
    <challenge-dialog v-model="dialog" />
  </v-row>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import ChallengeInbox from '@/components/open-play/challenge-inbox.vue';
import ChallengeDialog from '@/components/open-play/challenge-dialog.vue';
import ChallengePolicyForm from '@/components/open-play/challenge-policy-form.vue';
import EntryPolicyForm from '@/components/open-play/entry-policy-form.vue';
import { useOpenPlayStore } from '@/store/open-play';

/** League and group matches come from challenges: answer them, send them,
 * and set what happens while you're away. */
const store = useOpenPlayStore();
const dialog = ref(false);
onMounted(() => store.start());
onUnmounted(() => store.stop());
</script>
