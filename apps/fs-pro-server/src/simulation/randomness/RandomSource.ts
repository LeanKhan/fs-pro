export interface RandomState {
  kind: 'seeded' | 'system';
  seed: string;
  initialSeed: string;
  calls: number;
}

export interface RandomSource {
  readonly seed: string;
  next(): number;
  nextInt(maxExclusive: number): number;
  chance(percent: number): boolean;
  fork(label: string): RandomSource;
  getState(): RandomState;
}

export type RandomInput = RandomSource | string | undefined;

const hashSeed = (seed: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export class SeededRandomSource implements RandomSource {
  public readonly seed: string;
  private state: number;
  private calls = 0;

  constructor(
    seed: string,
    private readonly initialSeed = seed
  ) {
    this.seed = seed;
    this.state = hashSeed(seed);
  }

  public next(): number {
    this.calls++;
    this.state += 0x6d2b79f5;
    let next = this.state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      return 0;
    }
    return Math.floor(this.next() * maxExclusive);
  }

  public chance(percent: number): boolean {
    return this.next() * 100 <= percent;
  }

  public fork(label: string): RandomSource {
    return new SeededRandomSource(`${this.seed}:${label}`, this.initialSeed);
  }

  public getState(): RandomState {
    return {
      kind: 'seeded',
      seed: this.seed,
      initialSeed: this.initialSeed,
      calls: this.calls,
    };
  }
}

export class SystemRandomSource implements RandomSource {
  public readonly seed = 'system';
  private calls = 0;

  public next(): number {
    this.calls++;
    return Math.random();
  }

  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      return 0;
    }
    return Math.floor(this.next() * maxExclusive);
  }

  public chance(percent: number): boolean {
    return this.next() * 100 <= percent;
  }

  public fork(_label: string): RandomSource {
    return new SystemRandomSource();
  }

  public getState(): RandomState {
    return {
      kind: 'system',
      seed: this.seed,
      initialSeed: this.seed,
      calls: this.calls,
    };
  }
}

export const createRandomSource = (input?: RandomInput): RandomSource => {
  if (typeof input === 'string') {
    return new SeededRandomSource(input);
  }

  if (input) {
    return input;
  }

  return new SystemRandomSource();
};

let simulationRandomSource: RandomSource = new SystemRandomSource();

export const setSimulationRandomSource = (random: RandomInput): RandomSource => {
  simulationRandomSource = createRandomSource(random);
  return simulationRandomSource;
};

export const getSimulationRandomSource = (): RandomSource =>
  simulationRandomSource;

export const simulationRandom = (): number => simulationRandomSource.next();

export const simulationRandomInt = (maxExclusive: number): number =>
  simulationRandomSource.nextInt(maxExclusive);

export const randomNDigits = (
  length: number,
  random: Pick<RandomSource, 'nextInt'>
): number => {
  const digits = Array.from({ length }, () => random.nextInt(10)).join('');
  return Number(digits);
};
