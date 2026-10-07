<template>
  <form v-if="!done" class="form" @submit.prevent="save">
    <p class="sub">Choose a new password for your account.</p>
    <p v-if="!token" class="warn">This link is incomplete. Open it again from your email, or <router-link to="/auth/forgot">ask for a new one</router-link>.</p>
    <p v-if="error" class="warn">{{ error }} <router-link to="/auth/forgot">Ask for a new link</router-link></p>
    <label>
      <span>New password <small>at least 8 characters</small></span>
      <input v-model="password" type="password" autocomplete="new-password" required :disabled="loading || !token" />
    </label>
    <label>
      Password again
      <input v-model="again" type="password" autocomplete="new-password" required :disabled="loading || !token" :class="{ bad: again && again !== password }" />
    </label>
    <button class="btn primary" type="submit" :disabled="loading || !token || password.length < 8 || password !== again">{{ loading ? 'Saving…' : 'Save new password' }}</button>
  </form>
  <div v-else class="form">
    <p class="warn good">Your password is changed and you're signed out everywhere else.</p>
    <router-link class="btn primary" to="/auth/login">Sign in</router-link>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { client } from '@/services/api';

const route = useRoute();
const token = typeof route.query.token === 'string' ? route.query.token : '';
const password = ref('');
const again = ref('');
const loading = ref(false);
const error = ref('');
const done = ref(false);

async function save() {
  loading.value = true;
  error.value = '';
  try {
    const res = await client.users.resetPassword.mutation({ body: { Token: token, NewPassword: password.value } });
    if (res.status === 200) done.value = true;
    else error.value = (res.body as { message?: string }).message ?? 'Could not change the password';
  } catch {
    error.value = 'Could not reach the server. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
input.bad {
  border-color: var(--red) !important;
}
.btn.primary {
  text-decoration: none;
}
</style>
