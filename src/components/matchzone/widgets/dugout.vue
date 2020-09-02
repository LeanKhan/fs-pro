<template>
  <div>
    <v-tabs fixed-tabs v-model="tab">
      <v-tab>
        Players
      </v-tab>

      <v-tab>
        Squad
      </v-tab>
    </v-tabs>
    <v-tabs-items v-model="tab">
      <v-tab-item>
        <div class="px-0 py-2">
          <v-list-item dense>
            <v-list-item-avatar tile size="30px">
              <v-badge
                bordered
                bottom
                color="green accent-3"
                dot
                offset-x="10"
                offset-y="10"
              >
                <v-icon style="font-size: 30px; height: 30px" large>
                  ${{ home.ClubCode }}
                </v-icon>
              </v-badge>
            </v-list-item-avatar>

            <v-list-item-content>
              <v-list-item-title>
                {{ home.Manager }}
              </v-list-item-title>

              <v-list-item-subtitle>
                {{ home.Name }}
              </v-list-item-subtitle>
            </v-list-item-content>
          </v-list-item>
          <squad-list :squad="home.Players"></squad-list>
        </div>
      </v-tab-item>
      <v-tab-item>
        <v-card-text>
          B
        </v-card-text>
      </v-tab-item>
    </v-tabs-items>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import SquadList from '../squad-list.vue';

@Component({
  components: {
    SquadList,
  },
})
export default class Dugout extends Vue {
  @Prop({ required: true }) home!: any;
  @Prop({ required: true }) away!: any;
  @Prop({ required: false }) homeSquad!: any;
  @Prop({ required: false }) awaySquad!: any;

  private tab: any = null;
}
</script>
