<template>
  <div class="home">
    <div class="d-flex justify-center align-center" style="height: 400px;">
      <img
        alt="FsPro Logo :)"
        height="200px"
        src="http://localhost:3000/img/logo-new.png"
      />
    </div>
    <p class="display-2 secondary--text text-center">FSPro</p>
    <p class="caption secondary--text lighten-3 text-center">
      thank you Jesus!
    </p>
  </div>
</template>

<script lang="ts">
// @ is an alias to /src
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class AdminDashboard extends Vue {}
</script>
