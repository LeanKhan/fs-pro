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
import { client } from '@/services/api';

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
    const response = await client.users.loginUser.mutation({
      body: { Username: Username.value, Password: Password.value },
    });

    if (response.status === 200) {
      store.showToast({
        message: 'Signed in Successfully!',
        style: 'success',
      });

      store.setUser({
        username: response.body.payload.Username,
        userID: response.body.payload._id ?? '',
        clubs: response.body.payload.Clubs ?? [],
        isAdmin: response.body.payload.isAdmin,
        avatar: response.body.payload.Avatar ?? '',
        fullname: response.body.payload.FullName,
      });

      router.push('/u');
    } else {
      loginError.value = response.body.message;
    }
  } catch (error) {
    loginError.value = 'Unable to log in. Please try again.';
    console.error('Error logging in!', error);
  } finally {
    loading.value = false;
  }
}

async function submitNewPassword() {
  loading.value = true;
  try {
    const response = await client.users.changePassword.mutation({
      body: newForm.value,
    });

    if (response.status === 200) {
      console.log('User => ', response.body.payload);
      store.setUser({
        username: response.body.payload.Username,
        userID: response.body.payload._id ?? '',
        clubs: response.body.payload.Clubs ?? [],
        isAdmin: response.body.payload.isAdmin,
        avatar: response.body.payload.Avatar ?? '',
        fullname: response.body.payload.FullName,
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
