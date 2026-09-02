// Source - https://stackoverflow.com/a/73942673
// Posted by Rookie Coder, modified by community. See post 'Timeline' for change history
// Retrieved 2025-11-20, License - CC BY-SA 4.0

// customSvgs.ts
import { h } from 'vue';
import type { IconSet, IconProps } from 'vuetify';

const iconFileByName: Record<string, string> = {
  ACP: 'ACP',
  AM: 'AM',
  AP: 'ACP',
  AS: 'AS',
  BAT: 'BAT',
  BFC: 'BFC',
  BFZ: 'BFZ',
  BPG: 'BPG',
  BWH: 'BWH',
  CHI: 'CHI',
  CTR: 'CTR',
  DOU: 'DOU',
  DR: 'DR',
  DYN: 'DYN',
  EF: 'EF',
  FUN: 'FUN',
  FZP: 'FZP',
  GBL: 'GBL',
  GFZ: 'GFZ',
  GU: 'GU',
  IB: 'IB',
  JAC: 'JAC',
  K94: 'K94',
  KFZ: 'KFZ',
  LKM: 'LKM',
  LRU17: 'LRU17',
  LU: 'LU',
  NET: 'NET',
  NSM: 'NSM',
  NU: 'NU',
  PAC: 'PAC',
  PGS: 'PGS',
  PUN: 'PUN',
  RB: 'RB',
  RED: 'RED',
  RP: 'RP',
  RT: 'RT',
  SDS: 'SDS',
  SFZ: 'SFZ',
  SPO: 'SPO',
  SPR: 'SPR',
  SUN: 'SUN',
  TRI: 'TRI',
  VAS: 'VAS',
  ZD: 'ZD',
};

const customIcons: IconSet = {
  component: (props: IconProps) => {
    const iconName = props.icon as string;
    const fileName = iconFileByName[iconName];

    return h(props.tag, [
      fileName &&
        h('img', {
          alt: '',
          class: 'v-icon__svg',
          src: `/club-icons/${fileName}.svg`,
        }),
    ]);
  },
};

export { customIcons /* aliases */ };
