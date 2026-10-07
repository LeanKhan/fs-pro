<template>
  <div class="form">
    <p v-if="state === 'working'" class="sub">Confirming your email…</p>
    <template v-else-if="state === 'ok'">
      <p class="warn good">Your email is confirmed. Thank you!</p>
      <router-link class="btn primary" :to="signedIn ? '/start' : '/auth/login'">{{ signedIn ? 'Found your club' : 'Sign in' }}</router-link>
    </template>
    <template v-else>
      <p class="warn">{{ message }}</p>
      <router-link class="btn primary" :to="signedIn ? '/u/settings' : '/auth/login'">{{ signedIn ? 'Send a new link from Settings' : 'Sign in to get a new link' }}</router-link>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { client } from '@/services/api';

const route = useRoute();
const state = ref<'working' | 'ok' | 'bad'>('working');
const message = ref('');
const signedIn = !!localStorage.getItem('fspro-user');

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : '';
  if (!token) {
    state.value = 'bad';
    message.value = 'This link is incomplete. Open it again from your email.';
    return;
  }
  try {
    const res = await client.users.verifyEmail.mutation({ body: { Token: token } });
    if (res.status === 200) state.value = 'ok';
    else {
      state.value = 'bad';
      message.value = (res.body as { message?: string }).message ?? 'Could not confirm the email';
    }
  } catch {
    state.value = 'bad';
    message.value = 'Could not reach the server. Please try again.';
  }
});
</script>

<style scoped>
.btn.primary {
  text-decoration: none;
}
</style>
