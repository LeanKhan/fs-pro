<template>
  <v-card>
    <v-card-text class="text-center">
      <template v-if="!failed">
        <v-progress-circular indeterminate color="green" class="mb-3" />
        <div>Signing you in...</div>
      </template>
      <template v-else>
        <v-alert type="error" variant="tonal" density="compact" class="mb-4">
          {{ failed }}
        </v-alert>
        <v-btn color="green-darken-2" to="/auth/login">Back to login</v-btn>
      </template>
    </v-card-text>
  </v-card>
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
function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/u';
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
    store.setUser({
      username: user.Username,
      userID: user._id ?? '',
      clubs: user.Clubs ?? [],
      isAdmin: user.isAdmin,
      avatar: user.Avatar ?? '',
      fullname: user.FullName,
    });
    store.showToast({ message: 'Signed in Successfully!', style: 'success' });
    router.replace(safeReturnTo(route.query.returnTo));
  } catch (error) {
    console.error('Error completing login:', error);
    failed.value = 'Could not complete the login. Please try again.';
  }
});
</script>
