<template>
  <form ref="form" @submit.prevent="login">
    <v-card>
      <v-card-text>
        <v-text-field
          required
          type="text"
          label="Username"
          v-model="form.Username"
        ></v-text-field>

        <v-text-field
          required
          type="text"
          label="Password"
          v-model="form.Password"
        ></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-btn color="green darken-2" @click="login" block>
          Login
        </v-btn>
      </v-card-actions>
    </v-card>
  </form>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
@Component
export default class Login extends Vue {
  private form = {
    Username: '',
    Password: '',
  };

  private login() {
    this.$axios
      .post('/users/login', { data: { ...this.form } })
      .then(response => {
        console.log('Response => ', response.data);
        if (response.data.success) {
          window.localStorage.setItem(
            'fs-pro-user',
            JSON.stringify({
              username: response.data.payload.Username,
              isAdmin: response.data.payload.isAdmin,
            })
          );
        }

        this.$router.push('/u');
      })
      .catch(response => {
        console.log('Error logging in! ', response.data);
      });
  }
}
</script>

<style></style>
