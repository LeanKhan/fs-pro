<template>
  <div>
    <form>
      <v-card>
        <v-card-text>
          <v-text-field
            required
            type="text"
            label="Full Name"
            v-model="form.FullName"
          ></v-text-field>

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

          <v-text-field
            :error="confirmPassword != form.Password"
            required
            type="text"
            label="Confirm Password"
            v-model="confirmPassword"
          ></v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-btn color="green darken-2" @click="register" block>
            Join
          </v-btn>
        </v-card-actions>
      </v-card>
    </form>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
@Component
export default class Register extends Vue {
  private form = {
    FullName: '',
    Username: '',
    Password: '',
  };
  private confirmPassword = '';
  private register() {
    this.$axios
      .post('/users/join', { data: { ...this.form } })
      .then(response => {
        if (response.data.success) {
          window.localStorage.setItem(
            'fs-pro-user',
            JSON.stringify({
              username: response.data._doc.Username,
              isAdmin: response.data._doc.isAdmin,
            })
          );

          this.$router.push('/u');
        }
      })
      .catch(response => {
        console.log('Error logging in! ', response.data);
      });
  }
}
</script>

<style></style>
