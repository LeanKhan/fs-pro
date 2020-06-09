import Vue from 'vue';
import Vuetify from 'vuetify/lib';
import LasenaUnitedIcon from '../icons/LU.vue';
import DagadaRangersIcon from '../icons/DR.vue';
import RisingThundersIcon from '../icons/RT.vue';
import RainbowBoysIcon from '../icons/RB.vue';
import Khashiru94Icon from '../icons/K94.vue';
import  BrickwallHadadIcon from '../icons/BWH.vue';
import EasdenFrydgelandIcon from '../icons/EF.vue';
import  AlMoomoodIcon from '../icons/AM.vue';



Vue.use(Vuetify);

export default new Vuetify({
  icons: {
    values: {
      LU: {
        component: LasenaUnitedIcon,
      },
      DR: {
      	component: DagadaRangersIcon
      },
      RT: {
      	component: RisingThundersIcon
      },
      RB: {
      	component: RainbowBoysIcon
      },
      K94: {
      	component: Khashiru94Icon
      },
      BWH: {
      	component: BrickwallHadadIcon
      },
      EF: {
      	component: EasdenFrydgelandIcon
      },
      AM: {
      	component: AlMoomoodIcon
      }
    },
  },
});
