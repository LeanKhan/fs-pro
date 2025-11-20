// Source - https://stackoverflow.com/a/73942673
// Posted by Rookie Coder, modified by community. See post 'Timeline' for change history
// Retrieved 2025-11-20, License - CC BY-SA 4.0

//customSvgs.ts
import { h } from 'vue';
import type { IconSet, IconProps } from 'vuetify';
import K94Icon from '../icons/K94.vue';
import LasenaUnitedIcon from '../icons/LU.vue';
import DagadaRangersIcon from '../icons/DR.vue';
import RisingThundersIcon from '../icons/RT.vue';
import RainbowBoysIcon from '../icons/RB.vue';
import BrickwallHadadIcon from '../icons/BWH.vue';
import EasdenFrydgelandIcon from '../icons/EF.vue';
import AlMoomoodIcon from '../icons/AM.vue';
import BinatoneFcIcon from '../icons/BFC.vue';
import GuttersbergUnitedIcon from '../icons/GU.vue';
import IvaniaBoysIcon from '../icons/IB.vue';
import LonenRaidUnited17Icon from '../icons/LRU17.vue';
import NewSimeoneMirrorsIcon from '../icons/NSM.vue';
import NorthernUnitedIcon from '../icons/NU.vue';
import SouthportRangersIcon from '../icons/SPR.vue';
import VendoorsteinAthleticIcon from '../icons/VAS.vue';
import ZanderDragonsIcon from '../icons/ZD.vue';
import AlShalakatIcon from '../icons/AS.vue';
import ACPhilamentia from '../icons/ACP.vue';
import RoyalPhilamentia from '../icons/RP.vue';
import CevivaChiefsIcon from '../icons/CHI.vue';
import CevivaTorrentsIcon from '../icons/CTR.vue';
import RedKnightsIcon from '../icons/RED.vue';
import PaceIcon from '../icons/PAC.vue';
import FeedheinTridentsIcon from '../icons/TRI.vue';
import FeedheinUnitedIcon from '../icons/FUN.vue';
import JacwinthTanksIcon from '../icons/JAC.vue';
import DominionUnitedIcon from '../icons/DOU.vue';
import KyteIcon from '../icons/KFZ.vue';
import GreenBlueIcon from '../icons/GBL.vue';
import SportoMiduIcon from '../icons/SPO.vue';
import GiantsIcon from '../icons/GFZ.vue';
import PooventUnitedIcon from '../icons/PUN.vue';
import DynamiteIcon from '../icons/DYN.vue';
import PorgreggeIcon from '../icons/PGS.vue';
import BlazeCityIcon from '../icons/BFZ.vue';
import FZPreggeIcon from '../icons/FZP.vue';
import BoruzziaPreggeIcon from '../icons/BPG.vue';
import SdevSandsIcon from '../icons/SDS.vue';
import StallionsIcon from '../icons/SFZ.vue';
import SunnyCityIcon from '../icons/SUN.vue';
import BatsIcon from '../icons/BAT.vue';
import NettsIcon from '../icons/NET.vue';
import StorrLokomotivIcon from '../icons/LKM.vue';

const customSvgNameToComponent: any = {
  K94: K94Icon,
  LU: LasenaUnitedIcon,
  DR: DagadaRangersIcon,
  RT: RisingThundersIcon,
  RB: RainbowBoysIcon,
  BWH: BrickwallHadadIcon,
  EF: EasdenFrydgelandIcon,
  AM: AlMoomoodIcon,
  BFC: BinatoneFcIcon,
  GU: GuttersbergUnitedIcon,
  IB: IvaniaBoysIcon,
  LRU17: LonenRaidUnited17Icon,
  NSM: NewSimeoneMirrorsIcon,
  NU: NorthernUnitedIcon,
  SPR: SouthportRangersIcon,
  VAS: VendoorsteinAthleticIcon,
  ZD: ZanderDragonsIcon,
  AS: AlShalakatIcon,
  AP: ACPhilamentia,
  RP: RoyalPhilamentia,
  CHI: CevivaChiefsIcon,
  CTR: CevivaTorrentsIcon,
  RED: RedKnightsIcon,
  PAC: PaceIcon,
  TRI: FeedheinTridentsIcon,
  FUN: FeedheinUnitedIcon,
  JAC: JacwinthTanksIcon,
  DOU: DominionUnitedIcon,
  KFZ: KyteIcon,
  GBL: GreenBlueIcon,
  SPO: SportoMiduIcon,
  GFZ: GiantsIcon,
  PUN: PooventUnitedIcon,
  DYN: DynamiteIcon,
  PGS: PorgreggeIcon,
  BFZ: BlazeCityIcon,
  FZP: FZPreggeIcon,
  BPG: BoruzziaPreggeIcon,
  SDS: SdevSandsIcon,
  SFZ: StallionsIcon,
  SUN: SunnyCityIcon,
  BAT: BatsIcon,
  NET: NettsIcon,
  LKM: StorrLokomotivIcon,
};

const customIcons: IconSet = {
  component: (props: IconProps) =>
    h(props.tag, [
      h(customSvgNameToComponent[props.icon as string], {
        class: 'v-icon__svg',
      }),
    ]),
};

export { customIcons /* aliases */ };
