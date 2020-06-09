<template>
  <div>
    <router-view></router-view>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

@Component({})
export default class User extends Vue {
  private mounted() {
    console.log('Here at ', new Date());
    this.$nextTick(() => {
      console.log('Inside nextTick at ', new Date());
      this.$store.dispatch('SET_USER_CLUBS');
    });
  }
}
</script>
