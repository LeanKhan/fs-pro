<template>
  <form class="form" @submit.prevent="register">
    <p class="sub">Make an account, then found your club anywhere in the world.</p>
    <p v-if="error" class="warn">{{ error }}</p>
    <label>Your name<input v-model="form.FullName" autocomplete="name" maxlength="60" required /></label>
    <label>
      <span>Email <small>to confirm your account and reset your password</small></span>
      <input v-model.trim="form.Email" type="email" autocomplete="email" maxlength="254" required />
    </label>
    <label>
      <span>Username <small>3-24 letters, numbers, . _ -</small></span>
      <input v-model.trim="form.Username" autocomplete="username" maxlength="24" required />
    </label>
    <label>
      <span>Password <small>at least 8 characters</small></span>
      <input v-model="form.Password" type="password" autocomplete="new-password" required />
    </label>
    <label>
      Password again
      <input v-model="confirmPassword" type="password" autocomplete="new-password" required :class="{ bad: confirmPassword && confirmPassword !== form.Password }" />
    </label>
    <button class="btn primary" type="submit" :disabled="loading || !valid">{{ loading ? 'Creating…' : 'Create account' }}</button>
  </form>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import { client } from '@/services/api';

const router = useRouter();
const store = useStore();

const form = ref({ FullName: '', Username: '', Email: '', Password: '' });
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');

const valid = computed(
  () =>
    form.value.FullName.trim().length > 0 &&
    /^[A-Za-z0-9_.-]{3,24}$/.test(form.value.Username) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.Email) &&
    form.value.Password.length >= 8 &&
    form.value.Password === confirmPassword.value
);

async function register() {
  if (!valid.value) return;
  loading.value = true;
  error.value = '';
  try {
    const response = await client.users.joinUser.mutation({ body: form.value });
    if (response.status === 200) {
      store.setUser({
        userID: response.body.payload._id ?? '',
        username: response.body.payload.Username,
        clubs: [],
        isAdmin: response.body.payload.isAdmin,
        avatar: response.body.payload.Avatar ?? '',
        fullname: response.body.payload.FullName,
      });
      router.push('/start');
    } else {
      error.value = (response.body as { message?: string }).message ?? 'Could not create the account';
    }
  } catch (err) {
    console.error('Error registering:', err);
    error.value = 'Could not create the account. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
input.bad {
  border-color: var(--red) !important;
}
</style>
