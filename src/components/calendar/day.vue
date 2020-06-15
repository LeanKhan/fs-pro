<template>
  <v-card
    class="mx-2 pa-1"
    :input-value="active"
    active-class="indigo white--text"
    depressed
    rounded
    width="200px"
    :color="active ? 'indigo' : 'indigo lighten-2'"
    @click="toggle"
  >
    <v-card-text class="pa-0">
      <v-row no-gutters>
        <template v-if="!day.isFree">
          <v-col cols="12">
            <v-list-item>
              <v-list-item-avatar size="20px" color="amber">
                {{ day.Matches[0] ? day.Matches[0].Time : 'No Time :P' }}
              </v-list-item-avatar>
              <v-list-item-title class="caption">
                {{
                  day.Matches[0]
                    ? `${day.Matches[0].Fixture.Home} vs ${day.Matches[0].Fixture.Away}`
                    : 'No Match :P'
                }}
              </v-list-item-title>
            </v-list-item>
          </v-col>
          <v-col cols="12">
            <v-list-item>
              <v-list-item-avatar size="20px" color="amber">
                {{ day.Matches[1] ? day.Matches[1].Time : 'No time :P' }}
              </v-list-item-avatar>

              <v-list-item-title class="caption">
                {{
                  day.Matches[1]
                    ? `${day.Matches[1].Fixture.Home} vs ${day.Matches[1].Fixture.Away}`
                    : 'No Match :p'
                }}
              </v-list-item-title>
            </v-list-item>
          </v-col>
        </template>

        <!-- No match :p -->
        <template v-else>
          <p>no match!</p>
        </template>
      </v-row>
    </v-card-text>

    <v-divider></v-divider>
    <v-card-actions class="text-center">
      <v-chip small :color="active ? 'indigo darken-2' : 'indigo'">
        Day {{ day.Day }}
      </v-chip>
    </v-card-actions>
  </v-card>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
@Component
export default class CalendarDay extends Vue {
  @Prop({ required: true }) readonly day!: {};
  @Prop({ required: true }) readonly toggle!: any;
  @Prop({ required: true }) readonly active!: any;
}
</script>

<style></style>
