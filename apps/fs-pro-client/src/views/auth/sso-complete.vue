<template>
  <div class="form done">
    <template v-if="!failed">
      <div class="spinner" aria-hidden="true"></div>
      <p class="sub">Signing you in…</p>
    </template>
    <template v-else>
      <p class="warn">{{ failed }}</p>
      <router-link class="btn" to="/auth/login">Back to sign in</router-link>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from '@/store';
import { apiUrl } from '@/services/api';

defineOptions({ name: 'SsoComplete' });

const route = useRoute();
const router = useRouter();
const store = useStore();
const failed = ref('');

/** Only paths inside this app - never another site. */
function safeReturnTo(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && value !== '/u' ? value : null;
}

// The server has already verified the login and created the session cookie;
// this reads the signed-in user back and stores it the way password login does.
onMounted(async () => {
  try {
    const response = await fetch(`${apiUrl}/api/auth/session`, { credentials: 'include' });
    const body = await response.json();
    if (!response.ok || !body.payload) {
      failed.value = body.message || 'Could not complete the login.';
      return;
    }
    const user = body.payload;
    const clubs: string[] = user.Clubs ?? [];
    store.setUser({
      username: user.Username,
      userID: user._id ?? '',
      clubs,
      isAdmin: user.isAdmin,
      avatar: user.Avatar ?? '',
      fullname: user.FullName,
    });
    router.replace(safeReturnTo(route.query.returnTo) ?? (clubs.length ? `/game/${clubs[0]}` : '/start'));
  } catch (error) {
    console.error('Error completing login:', error);
    failed.value = 'Could not complete the login. Please try again.';
  }
});
</script>

<style scoped>
.done {
  justify-items: center;
  text-align: center;
}
.spinner {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 5px solid #eadbb8;
  border-top-color: var(--green);
  animation: spin 0.8s linear infinite;
}
</style>
