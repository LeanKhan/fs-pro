<template>
  <form ref="form" @submit.prevent="login">
    <v-card>
      <v-card-text>
        <template v-if="!showForgotSection">
          <v-list-subheader>Login to FSPro</v-list-subheader>

          <v-alert
            v-if="loginError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            {{ loginError }}
          </v-alert>

          <v-text-field
            required
            type="text"
            label="Username"
            :disabled="loading"
            :loading="loading"
            color="green"
            v-model="Username"
          />

          <v-text-field
            :append-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
            :rules="[rules.required, rules.min]"
            :type="showPassword ? 'text' : 'password'"
            class="input-group--focused"
            required
            label="Password"
            :disabled="loading"
            :loading="loading"
            color="green"
            v-model="Password"
            @click:append="showPassword = !showPassword"
          />
        </template>
        <template v-else>
          <v-list-subheader>Change Password</v-list-subheader>

          <v-text-field
            required
            type="text"
            label="Username"
            :disabled="loading"
            :loading="loading"
            color="pink"
            v-model="newForm.Username"
          ></v-text-field>

          <v-text-field
            required
            type="text"
            label="New Password"
            :disabled="loading"
            :loading="loading"
            color="pink"
            v-model="newForm.NewPassword"
          ></v-text-field>
        </template>

        <!-- Forgot Password -->
        <div>
          Forgot your password?
          <v-btn
            variant="outlined"
            @click="showForgotSection = !showForgotSection"
          >
            {{ showForgotSection ? 'I remember now' : 'Change Password' }}
          </v-btn>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-btn
          v-if="!showForgotSection"
          color="green-darken-2"
          @click="login"
          block
          :loading="loading"
        >
          Login
        </v-btn>

        <v-btn
          v-else
          color="pink-darken-2"
          @click="submitNewPassword"
          block
          :loading="loading"
        >
          Change Password
        </v-btn>
      </v-card-actions>
    </v-card>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from '@/store';
import { $axios } from '@/services/api';
import axios from 'axios';

defineOptions({
  name: 'LoginView',
});

const router = useRouter();
const store = useStore();

const Username = ref('');
const Password = ref('');

// New Form Refs

const rules = {
  required: (value: string) => !!value || 'Required.',
  min: (v: string) => v.length >= 8 || 'Min 8 characters',
  // passwordMatch
};

const showPassword = ref(true);

const newForm = ref({
  Username: '',
  NewPassword: '',
});

const loading = ref(false);
const showForgotSection = ref(false);
const loginError = ref('');

async function login() {
  loading.value = true;
  loginError.value = '';

  try {
    const response = await $axios.post(
      '/users/login',
      { data: { Username: Username.value, Password: Password.value } },
      { withCredentials: true }
    );

    if (response.data.success) {
      store.showToast({
        message: 'Signed in Successfully!',
        style: 'success',
      });

      store.setUser({
        username: response.data.payload.Username,
        userID: response.data.payload._id,
        clubs: response.data.payload.Clubs,
        //session: response.data.payload.Session,
        isAdmin: response.data.payload.isAdmin,
        avatar: response.data.payload.Avatar,
        fullname: response.data.payload.FullName,
      });

      router.push('/u');
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      loginError.value =
        error.response?.data?.message ?? 'Unable to log in. Please try again.';
    } else {
      loginError.value = 'Unable to log in. Please try again.';
    }

    console.error('Error logging in!', error);
  } finally {
    loading.value = false;
  }
}

async function submitNewPassword() {
  loading.value = true;
  try {
    const response = await $axios.post(
      '/users/change-password',
      newForm.value,
      { withCredentials: true }
    );

    if (response.data.success) {
      console.log('User => ', response.data.payload);
      store.setUser({
        username: response.data.payload.Username,
        userID: response.data.payload._id,
        clubs: response.data.payload.Clubs,
        // session: response.data.payload.Session,
        isAdmin: response.data.payload.isAdmin,
        avatar: response.data.payload.Avatar,
        fullname: response.data.payload.FullName,
      });

      router.push('/u');
    }
  } catch (error) {
    console.error('Error changing password!', error);
  } finally {
    showForgotSection.value = false;
    loading.value = false;
  }
}
</script>
