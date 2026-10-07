<template>
  <form class="form" @submit.prevent="send">
    <p class="sub">Forgot your password? Enter the email on your account and we'll send you a link to choose a new one.</p>
    <p v-if="error" class="warn">{{ error }}</p>
    <p v-if="sent" class="warn good">If that email belongs to an account, a link is on its way. Check your inbox (and spam).</p>
    <label>Email<input v-model.trim="email" type="email" autocomplete="email" maxlength="254" required :disabled="loading" /></label>
    <button class="btn primary" type="submit" :disabled="loading || !email">{{ loading ? 'Sending…' : sent ? 'Send it again' : 'Send the link' }}</button>
    <p class="hint"><router-link to="/auth/login">Back to sign in</router-link></p>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { client } from '@/services/api';

const email = ref('');
const loading = ref(false);
const sent = ref(false);
const error = ref('');

async function send() {
  loading.value = true;
  error.value = '';
  try {
    const res = await client.users.requestPasswordReset.mutation({ body: { Email: email.value } });
    if (res.status === 200) sent.value = true;
    else error.value = (res.body as { message?: string }).message ?? 'Could not send the link';
  } catch {
    error.value = 'Could not reach the server. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.hint {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
  text-align: center;
}
.hint a {
  color: var(--wood-d);
  font-weight: 600;
}
</style>
