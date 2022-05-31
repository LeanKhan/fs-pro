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

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
@Component
export default class Login extends Vue {
  private form = {
    Username: '',
    Password: '',
  };

  private newForm = {
    Username: '',
    NewPassword: '',
  };

  public loading = false;

  public showForgotSection = false;

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

        this.$store.dispatch('SHOW_TOAST', {
          message: 'Signed in Successfully!',
          style: 'success',
        });

          this.$store.dispatch('SET_USER', {
            username: response.data.payload.Username,
            userID: response.data.payload._id,
            clubs: response.data.payload.Clubs,
            session: response.data.payload.Session,
            isAdmin: response.data.payload.isAdmin,
            avatar: response.data.payload.Avatar,
            fullname: response.data.payload.FullName,
          });
        } else {
        this.$store.dispatch('SHOW_TOAST', {
          message: response.data.message,
          style: 'error',
        });
        }

        this.$socket.client.emit('authenticate');

        this.$router.push('/u');
      })
      .catch(response => {
        console.error('Error logging in! ', response);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  private submitNewPassword() {
    this.loading = true;
    this.$axios
      .post('/users/change-password', this.newForm, { withCredentials: true })
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
        console.log('Error changing password in! ', response.data);
      })
      .finally(() => {
        this.showForgotSection = false;
        this.loading = false;
      });
  }

  private showForgot() {
    this.showForgotSection = true;
  }
}
</script>

<style></style>
