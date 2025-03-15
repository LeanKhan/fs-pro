<template>
  <form ref="form" @submit.prevent="login">
    <v-card>
      <v-card-text>
        <template v-if="!showForgotSection">
          <v-subheader>Login to FSPro</v-subheader>

          <v-text-field
            required
            type="text"
            label="Username"
            :disabled="loading"
            :loading="loading"
            color="green"
            v-model="form.Username"
          ></v-text-field>

          <v-text-field
            required
            type="text"
            label="Password"
            :disabled="loading"
            :loading="loading"
            color="green"
            v-model="form.Password"
          ></v-text-field>
        </template>

        <template v-else>
          <v-subheader>Change Password</v-subheader>

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
          <v-btn outlined depressed @click="showForgot">
            Yup, ama fish eater
          </v-btn>
        </div>
      </v-card-text>

      <v-card-actions>
        <v-btn
          v-if="!showForgotSection"
          color="green darken-2"
          @click="login"
          block
          :loading="loading"
        >
          Login
        </v-btn>

        <v-btn
          v-else
          color="pink darken-2"
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
import { $axios } from '@/main';

const router = useRouter();
const store = useStore();

const form = ref({
  Username: '',
  Password: '',
});

const newForm = ref({
  Username: '',
  NewPassword: '',
});

const loading = ref(false);
const showForgotSection = ref(false);

async function login() {
  loading.value = true;
  try {
    const response = await $axios.post(
      '/users/login',
      { data: { ...form.value } },
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
        session: response.data.payload.Session,
        isAdmin: response.data.payload.isAdmin,
        avatar: response.data.payload.Avatar,
        fullname: response.data.payload.FullName,
      });
    } else {
      store.showToast({
        message: response.data.message,
        style: 'error',
      });
    }

    router.push('/u');
  } catch (error) {
    console.error('Error logging in!', error);
  } finally {
    loading.value = false;
  }
}

async function submitNewPassword() {
  loading.value = true;
  try {
    const response = await $axios.post('/users/change-password', newForm.value, { withCredentials: true });
    
    if (response.data.success) {
      store.setUser({
        username: response.data.payload.Username,
        userID: response.data.payload._id,
        clubs: response.data.payload.Clubs,
        session: response.data.payload.Session,
        isAdmin: response.data.payload.isAdmin,
        avatar: response.data.payload.Avatar,
        fullname: response.data.payload.FullName,
      });
    }

    router.push('/u');
  } catch (error) {
    console.error('Error changing password!', error);
  } finally {
    showForgotSection.value = false;
    loading.value = false;
  }
}

function showForgot() {
  showForgotSection.value = true;
}
</script>