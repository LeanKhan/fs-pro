import { pickRandomFromArray } from '../../helpers/misc';

export interface SyllableStructure {
  firstPrefixes: string[];
  firstSuffixes: string[];
  lastPrefixes: string[];
  lastSuffixes: string[];
  sampleFullFirst?: string[];
  sampleFullLast?: string[];
}

export const SYSTEM_COUNTRY_SYLLABLES: Record<string, SyllableStructure> = {
  kev: {
    firstPrefixes: ['Pald', 'Ver', 'Kyr', 'Vrom', 'Besh', 'Gar', 'Dori', 'Cal', 'Zan', 'Torb', 'Malk', 'Jor', 'Fen', 'Kev', 'Hend', 'Ald', 'Brev', 'Keld', 'Ror', 'Vand'],
    firstSuffixes: ['rov', 'g', 'o', 'diche', 'seen', 'an', 'lum', 'e', 'ik', 'or', 'ond', 'al', 'rik', 'mar', 'ev', 'en'],
    lastPrefixes: ['Viv', 'For', 'Hein', 'Ferm', 'Ash', 'Dfor', 'Kev', 'Ives', 'Carr', 'Ell', 'Grim', 'Stone', 'Vane', 'Barrow', 'Kevr', 'Farn', 'Hallow'],
    lastSuffixes: ['aegge', 'voly', 'veezl', 'egge', 'worth', 'ter', 'ow', 'ery', 'brook', 'croft', 'mont', 'gard', 'holme', 'wood', 'fell'],
  },
  bellean: {
    firstPrefixes: ['Dash', 'Chak', 'Hal', 'Koon', 'Umb', 'Tay', 'Am', 'Gid', 'Perc', 'Kel', 'Zul', 'Rond', 'Bar', 'Mav', 'Kwan', 'Kev', 'Sen', 'Dakar'],
    firstSuffixes: ['kar', 'a', 'san', 'lay', 'us', 'os', 'eon', 'y', 'an', 'da', 'our', 'in', 'tah', 'am', 'oko'],
    lastPrefixes: ['Ven', 'Mon', 'Ash', 'Undabott', 'San', 'Pembr', 'Kestr', 'Bly', 'Undat', 'Mar', 'Jej', 'Kalv', 'Dumb', 'Zul', 'Venom', 'Nnam'],
    lastSuffixes: ['om', 'soon', 'grove', 'omov', 'ook', 'el', 'the', 'in', 'i', 'us', 'ado', 'vitch', 'di', 'eji'],
  },
  kiyoto: {
    firstPrefixes: ['Hec', 'Mak', 'Pow', 'Hi', 'Kash', 'Rio', 'Kish', 'Jak', 'Tek', 'Ren', 'Ken', 'Sho', 'Dai', 'Tai', 'Ryu', 'Jun', 'Kaz'],
    firstSuffixes: ['tor', 'wa', 'wei', 'in', 'hee', 'to', 'shi', 'ro', 'ji', 'ki', 'zo', 'ko', 'sei', 'ma'],
    lastPrefixes: ['Chin', 'Sand', 'Chak', 'Opani', 'Moul', 'Pell', 'Chank', 'Kin', 'Joi', 'Hashi', 'Kuro', 'Mats', 'Tani', 'Sato', 'Naka'],
    lastSuffixes: [' Chin', 'ei', 'a', 'mei', 'ah', 'o', 'jo', 'da', 'ka', 'gawa', 'moto', 'sawa', 'zaki'],
  },
  simeone: {
    firstPrefixes: ['Al', 'Sim', 'Hag', 'Eld', 'Pro', 'Mart', 'Kel', 'Par', 'Ce', 'Zep', 'Don', 'Luc', 'Mat', 'Sal', 'Rafa', 'Mate', 'Leo'],
    firstSuffixes: ['e', 'im', 'oosh', 'sper', 'ti', 'vin', 'o', 'an', 'io', 'es', 'ino', 'etto', 'iel'],
    lastPrefixes: ['Par', 'Tar', 'Ash', 'Zep', 'Lug', 'Bar', 'Pot', 'For', 'Zeph', 'Mar', 'Cast', 'Val', 'Silv', 'Rios', 'Camp'],
    lastSuffixes: ['te', 'get', 'top', 'hran', 'e', 'n', 'o', 'te', 'i', 'ero', 'ano', 'etti', 'ello', 'eda'],
  },
  hunteerland: {
    firstPrefixes: ['Chall', 'Hui', 'Dip', 'Ash', 'Brin', 'Mist', 'Huk', 'Rush', 'Vorn', 'Kalt', 'Thor', 'Gunn', 'Bjo', 'Sven', 'Rik'],
    firstSuffixes: ['s', 'k', 'po', 'vin', 'y', 'am', 'e', 'en', 'or', 'und', 'ard', 'tor'],
    lastPrefixes: ['Vin', 'Boj', 'Fut', 'Hammein', 'Hunt', 'Vor', 'Barke', 'Heer', 'Don', 'Frost', 'Gron', 'Stad', 'Lind', 'Holm'],
    lastSuffixes: ['coat', 'a', 't', 'ster', 'mat', 'er', 'jun', 'heim', 'berg', 'land', 'gard', 'qvist'],
  },
  ekhastan: {
    firstPrefixes: ['Luk', 'El ', 'Ehl', 'Alkha', 'Dahv', 'Hag', 'Mel', 'Zul', 'Tari', 'Kha', 'Rash', 'Sam', 'Far', 'Mal', 'Emir'],
    firstSuffixes: ['i', 'da', 'kha', 'eed', 'im', 'anin', 'ar', 'a', 'oonsta', 'ur', 'ouq', 'ad', 'mir'],
    lastPrefixes: ['Bind', 'Talmul', 'Akht', 'Jah', 'Enderm', 'Agunb', 'Luka', 'Zah', 'Malik', 'Hass', 'Kham', 'Badr', 'Sult'],
    lastSuffixes: ['oosh', 'al', 'a', 'at', 'an', 'oro', 'i', 'ari', 'eh', 'een', 'ov', 'zadeh'],
  },
  upp: {
    firstPrefixes: ['Kos', 'Deskt', 'Cho ', 'Zul', 'Perrip', 'Glo', 'Hein', 'Pull', 'Miko', 'Bak', 'Fen', 'Kobo', 'Duro'],
    firstSuffixes: ['o', 'ho', 'oop', 'Jin', 'ot', 'ov', 'z', 'er', 'un', 'ado', 'eni', 'oku'],
    lastPrefixes: ['Limp', 'Undat', 'Change', 'Samwend', 'Dulop', 'Brick', 'Jolog', 'Shore', 'Tid', 'Kola', 'Balog', 'Wende'],
    lastSuffixes: ['opo', 'op', 'hands', 'ei', 'ot', 'o', 'ton', 'wall', 'port', 'un', 'aye'],
  },
  ashter: {
    firstPrefixes: ['Dani', 'Dehl', 'Jer', 'Tes', 'Khim', 'Falm', 'Kam', 'Zeh', 'Saf', 'Niz', 'Tari', 'Ibr'],
    firstSuffixes: ['yel', 'a', 'ry', 'ata', 'im', 'ir', 'an', 'on', 'ah', 'ood'],
    lastPrefixes: ['Effont', 'Opol', 'Kaph', 'Muhud', 'Dust', 'Amm', 'Kan', 'Sult', 'Khar', 'Mans'],
    lastSuffixes: ['ry', 'opo', 'ar', 'ia', 'y', 'o', 'ari', 'ani', 'ian', 'our'],
  },
  legardio: {
    firstPrefixes: ['Joll', 'Mark', 'Fin', 'Butul', 'Buiss', 'Plastiqu', 'Tomk', 'Raktan', 'Io', 'Vinc', 'Enz', 'Pao', 'Mat'],
    firstSuffixes: ['i', 'us', 'e', 'ee', 'ani', 'o', 'an', 'ell', 'ino', 'etto'],
    lastPrefixes: ['Did', 'Brun', 'LaCaz', 'Brinki', 'Jamez', 'Zpirihen', 'Zonzinz', 'Spoon', 'Sis', 'Ross', 'Bell'],
    lastSuffixes: ['o', 'ei', 'era', 's', 'on', 'i', 'aro', 'ano', 'ini', 'ello', 'etti'],
  },
  pregge: {
    firstPrefixes: ['Progg', 'Xinv', 'Poot', 'Tih', 'Bon', 'Torup', 'Dun', 'Greg', 'Klug', 'Zopp', 'Plonk', 'Greb'],
    firstSuffixes: ['ess', 'opp', 'k', 'ette', 'pp', 'o', 'ge', 'en', 'ik', 'ung'],
    lastPrefixes: ['Ann', 'Vox', 'Thip', 'Toh', 'Phod', 'Stuech', 'Mein', 'Cheveg', 'Bagg', 'Zamez', 'Plumm', 'Dunk'],
    lastSuffixes: ['ur', 'pp', 'k', 'de', 'zz', 'ge', 'i', 'ort', 'eck', 'aff'],
  },
  proland: {
    firstPrefixes: ['Gorh', 'Pal', 'Zibr', 'Phow', 'Pro', 'Kev', 'Dan', 'Vikt', 'Stan', 'Bog', 'Milos', 'Jur'],
    firstSuffixes: ['ay', 'a', 'ard', 'inn', 'or', 'ik', 'an', 'ov', 'ic', 'ek'],
    lastPrefixes: ['Fullmein', 'Morg', 'Vov', 'Bukk', 'Brad', 'Nol', 'Kov', 'Stol', 'Rad', 'Bork'],
    lastSuffixes: ['ster', 'an', 'ik', 'e', 'en', 'ski', 'ov', 'ic', 'ovic', 'enko'],
  },
};

/**
 * Procedurally generates a brand-new, novel name conforming to the
 * phonological and morphological structure of the given in-universe system country.
 */
export function generateSystemCountryName(countryNameOrCode: string): { firstName: string; lastName: string } {
  const key = countryNameOrCode.toLowerCase().trim();
  const matchedKey =
    Object.keys(SYSTEM_COUNTRY_SYLLABLES).find(
      (k) => key.includes(k) || k.includes(key)
    ) ?? 'kev';

  const structure = SYSTEM_COUNTRY_SYLLABLES[matchedKey];

  const firstPre = pickRandomFromArray(structure.firstPrefixes);
  const firstSuf = pickRandomFromArray(structure.firstSuffixes);
  const lastPre = pickRandomFromArray(structure.lastPrefixes);
  const lastSuf = pickRandomFromArray(structure.lastSuffixes);

  // Capitalize and assemble cleanly
  const firstName = `${firstPre}${firstSuf}`.replace(/\s+/g, ' ').trim();
  const lastName = `${lastPre}${lastSuf}`.replace(/\s+/g, ' ').trim();

  return { firstName, lastName };
}
