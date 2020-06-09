<template>
  <form ref="form" @submit.prevent="login">
    <v-card>
      <v-card-text>
        <v-text-field
          required
          type="text"
          label="Username"
          :disabled="loading"
          color="green"
          v-model="form.Username"
        ></v-text-field>

        <v-text-field
          required
          type="text"
          label="Password"
          :disabled="loading"
          color="green"
          v-model="form.Password"
        ></v-text-field>
      </v-card-text>
      <v-card-actions>
        <v-btn color="green darken-2" @click="login" block :loading="loading">
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

  public loading = false;

  private login() {
    this.loading = true;
    this.$axios
      .post(
        '/users/login',
        { data: { ...this.form } },
        { withCredentials: true }
      )
      .then(response => {
        console.log('Response => ', response.data);
        if (response.data.success) {
          this.$store.dispatch('SET_USER', {
            username: response.data.payload.Username,
            userID: response.data.payload._id,
            clubs: response.data.payload.Clubs,
            session: response.data.payload.Session,
            isAdmin: response.data.payload.isAdmin,
            avatar: response.data.payload.Avatar,
            fullname: response.data.payload.FullName,
          });
        }

        this.$socket.client.emit('authenticate');

        this.$router.push('/u');
      })
      .catch(response => {
        console.log('Error logging in! ', response.data);
      })
      .finally(() => {
        this.loading = false;
      });
  }
}
</script>

<style></style>
