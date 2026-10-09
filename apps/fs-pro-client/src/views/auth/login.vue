<template>
  <!-- Imagination login: accounts live in the world service; this just sends
       people there and back (see /api/auth/login on the server). -->
  <div v-if="ssoEnabled" class="form">
    <p v-if="ssoError" class="warn">{{ ssoError }}</p>
    <p class="sub">Sign-in is handled by Imagination, your world account.</p>
    <a class="btn primary" :href="ssoLoginUrl">Sign in with Imagination</a>
  </div>
  <form v-else class="form" @submit.prevent="login">
    <p v-if="loginError" class="warn">{{ loginError }}</p>
    <label>Username<input v-model.trim="Username" autocomplete="username" required :disabled="loading" /></label>
    <label>
      Password
      <span class="pw">
        <input v-model="Password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" required :disabled="loading" />
        <button type="button" class="btn tiny" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button>
      </span>
    </label>
    <button class="btn primary" type="submit" :disabled="loading || !Username || !Password">{{ loading ? 'Signing in…' : 'Sign in' }}</button>
    <p class="hint"><router-link to="/auth/forgot">Forgot your password?</router-link></p>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import { client, apiUrl } from '@/services/api';

defineOptions({ name: 'LoginView' });

const router = useRouter();
const store = useStore();
const route = useRoute();

// Set VITE_IMAGINATION_LOGIN=true to sign in through Imagination instead of
// FSPro's own username/password form.
const ssoEnabled = import.meta.env.VITE_IMAGINATION_LOGIN === 'true';
const ssoLoginUrl = `${apiUrl}/api/auth/login`;
const ssoError = typeof route.query.error === 'string' ? route.query.error : '';

const Username = ref('');
const Password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const loginError = ref('');

async function login() {
  loading.value = true;
  loginError.value = '';
  try {
    const response = await client.users.loginUser.mutation({
      body: { Username: Username.value, Password: Password.value },
    });
    if (response.status === 200) {
      store.setUser({
        username: response.body.payload.Username,
        userID: response.body.payload._id ?? '',
        clubs: response.body.payload.Clubs ?? [],
        isAdmin: response.body.payload.isAdmin,
        avatar: response.body.payload.Avatar ?? '',
        fullname: response.body.payload.FullName,
      });
      // Managers without a club go to /start (router guard).
      router.push(response.body.payload.Clubs?.length ? `/game/${response.body.payload.Clubs[0]}` : '/start');
    } else {
      loginError.value = response.body.message;
    }
  } catch (error) {
    loginError.value = 'Unable to sign in. Please try again.';
    console.error('Error logging in!', error);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.pw {
  display: flex;
  gap: 6px;
  align-items: center;
}
.pw input {
  flex: 1;
  min-width: 0;
}
.hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
.hint a {
  color: var(--wood-d);
  font-weight: 600;
}
.btn.primary {
  text-decoration: none;
}
</style>
