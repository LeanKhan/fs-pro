<template>
  <div>
    <v-tabs fixed-tabs v-model="tab">
      <v-tab>
        Squad
      </v-tab>

      <v-tab>
        Setup
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

            <v-spacer></v-spacer>
            <v-btn icon @click="showHomeSquad = !showHomeSquad">
              <v-icon>
                {{ showHomeSquad ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
              </v-icon>
            </v-btn>
          </v-list-item>
          <v-expand-transition>
            <div v-show="showHomeSquad">
              <v-divider></v-divider>
              <squad-list
                :squad="homeSquad"
                :matchFinished="matchFinished"
              ></squad-list>
            </div>
          </v-expand-transition>
          <v-divider></v-divider>
          <!-- Away Squad -->
          <v-list-item dense>
            <v-list-item-avatar tile size="30px">
              <v-badge
                bordered
                bottom
                color="pink darken-3"
                dot
                offset-x="10"
                offset-y="10"
              >
                <v-icon style="font-size: 30px; height: 30px" large>
                  ${{ away.ClubCode }}
                </v-icon>
              </v-badge>
            </v-list-item-avatar>

            <v-list-item-content>
              <v-list-item-title>
                {{ away.Manager }}
              </v-list-item-title>

              <v-list-item-subtitle>
                {{ away.Name }}
              </v-list-item-subtitle>
            </v-list-item-content>

            <v-spacer></v-spacer>
            <v-btn icon @click="showAwaySquad = !showAwaySquad">
              <v-icon>
                {{ showAwaySquad ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
              </v-icon>
            </v-btn>
          </v-list-item>
          <v-expand-transition>
            <div v-show="showAwaySquad">
              <v-divider></v-divider>
              <squad-list
                :squad="awaySquad"
                :matchFinished="matchFinished"
              ></squad-list>
            </div>
          </v-expand-transition>
        </div>
      </v-tab-item>
      <v-tab-item>
        <v-card-text>
          Coming soon...
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
  @Prop({ required: false }) match!: any;
  @Prop({ required: false, default: false }) matchFinished!: any;

  private tab: any = null;

  private showHomeSquad = false;
  private showAwaySquad = false;

  get HomeSideDetails() {
    if (this.match) return this.match.HomeSideDetails;
    else return false;
  }

  get AwaySideDetails() {
    if (this.match) return this.match.AwaySideDetails;
    else return false;
  }
}
</script>
