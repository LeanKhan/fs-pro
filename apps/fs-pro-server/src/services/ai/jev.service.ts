import axios from 'axios';

export type QuestionType = 'choice' | 'score' | 'noul';

export interface ChoiceQuestion<T extends string = string> {
  type: 'choice';
  instructions: string;
  criteria: Record<T, string>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { yes?: string; no?: string };
}

export type JevQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface ChoiceAnswer<T extends string = string> {
  choice: T;
  probabilities: Record<T, number>;
  confidence: number;
}

export interface ScoreAnswer {
  score: number;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface NoulAnswer {
  noul: number;
}

export type JevAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface JevResponse {
  answers: Record<string, JevAnswer>;
}

export class JevService {
  private static apiKey = process.env.TYPESAFE_API_KEY ?? '';
  private static apiUrl = process.env.TYPESAFE_API_URL ?? 'https://api.typesafe.ai/v1/system-one';
  private static model = process.env.TYPESAFE_MODEL ?? 'jev';

  /**
   * Evaluates one or more typed questions against a domain state payload.
   * If no API key is provided, gracefully resolves via calibrated heuristic fallback.
   */
  public static async ask(
    state: Record<string, unknown>,
    questions: Record<string, JevQuestion>
  ): Promise<JevResponse> {
    if (this.apiKey) {
      try {
        const response = await axios.post(
          this.apiUrl,
          {
            model: this.model,
            state,
            questions,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 5000,
          }
        );

        if (response.status === 200 && response.data?.answers) {
          return response.data as JevResponse;
        }
      } catch (err: any) {
        console.warn(`[JevService] API call failed, falling back to calibrated default:`, err?.message ?? err);
      }
    }

    // Calibrated offline fallback when API key is missing or call fails
    return this.fallbackEvaluate(state, questions);
  }

  /**
   * Built-in Local Decision Emulator.
   * Runs locally with zero API keys, zero accounts, and zero network calls.
   * Evaluates domain state using probabilistic utility functions, returning
   * realistic calibrated distributions, choices, and confidence scores matching Jev's schema.
   */
  public static fallbackEvaluate(
    state: Record<string, unknown>,
    questions: Record<string, JevQuestion>
  ): JevResponse {
    const answers: Record<string, JevAnswer> = {};

    for (const [id, q] of Object.entries(questions)) {
      if (q.type === 'choice') {
        const keys = Object.keys(q.criteria);
        let probabilities: Record<string, number> = {};

        if (id === 'tacticalShift') {
          const goalDiff = (state.goalDiff as number) ?? 0;
          const hasRedCard = Boolean(state.hasRedCard);

          if (hasRedCard) {
            probabilities = { 'low-block': 0.72, maintain: 0.20, 'high-press': 0.08 };
          } else if (goalDiff <= -2) {
            probabilities = { 'high-press': 0.65, maintain: 0.25, 'low-block': 0.10 };
          } else {
            probabilities = { maintain: 0.75, 'high-press': 0.15, 'low-block': 0.10 };
          }
        } else if (id === 'offerVerdict') {
          const ratio = (state.ratio as number) ?? 1.0;
          if (ratio >= 1.25) {
            probabilities = { accept: 0.68, negotiate: 0.28, reject: 0.04 };
          } else if (ratio >= 0.9) {
            probabilities = { negotiate: 0.62, accept: 0.26, reject: 0.12 };
          } else {
            probabilities = { reject: 0.65, negotiate: 0.30, accept: 0.05 };
          }
        } else if (id === 'boardAction') {
          const gamesWithoutWin = (state.gamesWithoutWin as number) ?? 0;
          const posDiff = ((state.currentPosition as number) ?? 0) - ((state.targetPosition as number) ?? 0);

          if (gamesWithoutWin >= 6 || posDiff >= 6) {
            probabilities = { sack: 0.60, warn: 0.32, back: 0.08 };
          } else if (gamesWithoutWin >= 3 || posDiff >= 3) {
            probabilities = { warn: 0.58, back: 0.32, sack: 0.10 };
          } else {
            probabilities = { back: 0.78, warn: 0.18, sack: 0.04 };
          }
        } else if (id === 'mediaLeadStory') {
          const isDerby = Boolean(state.isDerby);
          const hasBigTransfer = Boolean(state.hasBigTransfer);
          if (isDerby) {
            probabilities = { derby_spotlight: 0.88, match_preview: 0.08, club_feature: 0.04 };
          } else if (hasBigTransfer) {
            probabilities = { transfer_buzz: 0.75, match_preview: 0.15, club_feature: 0.10 };
          } else {
            probabilities = { match_preview: 0.65, club_feature: 0.25, derby_spotlight: 0.10 };
          }
        } else if (id === 'crisisLevel') {
          const gamesWithoutWin = (state.gamesWithoutWin as number) ?? 0;
          const concededRate = (state.concededRate as number) ?? 1.2;
          const leagueAvg = (state.leagueAvg as number) ?? 1.2;
          if (gamesWithoutWin >= 4 || concededRate >= leagueAvg + 0.6) {
            probabilities = { crisis: 0.72, underperforming: 0.20, balanced: 0.06, surging: 0.02 };
          } else if (gamesWithoutWin >= 2 || concededRate >= leagueAvg + 0.2) {
            probabilities = { underperforming: 0.64, crisis: 0.22, balanced: 0.11, surging: 0.03 };
          } else {
            probabilities = { balanced: 0.60, surging: 0.25, underperforming: 0.12, crisis: 0.03 };
          }
        } else if (id === 'tacticalPivot') {
          const weakestUnit = String(state.weakestUnit || '');
          const concededHigh = Boolean(state.concededHigh);
          if (weakestUnit === 'Defence' || concededHigh) {
            probabilities = { 'low-block': 0.65, 'counter-attack': 0.25, possession: 0.06, 'high-press': 0.04 };
          } else if (weakestUnit === 'Attack') {
            probabilities = { 'counter-attack': 0.55, 'high-press': 0.25, possession: 0.15, 'low-block': 0.05 };
          } else {
            probabilities = { 'counter-attack': 0.45, 'low-block': 0.25, possession: 0.20, 'high-press': 0.10 };
          }
        } else if (id === 'trainingDirective') {
          const weakestUnit = String(state.weakestUnit || '');
          if (weakestUnit === 'Defence') {
            probabilities = { Defending: 0.78, Physical: 0.14, Technical: 0.05, Attacking: 0.03 };
          } else if (weakestUnit === 'Attack') {
            probabilities = { Attacking: 0.76, Technical: 0.14, Physical: 0.07, Defending: 0.03 };
          } else {
            probabilities = { Physical: 0.40, Defending: 0.30, Attacking: 0.20, Technical: 0.10 };
          }
        } else if (id === 'playerListingReaction') {
          const isYouth = Boolean(state.isYouth);
          const isKeyPlayer = Boolean(state.isKeyPlayer);
          const priceRatio = (state.priceRatio as number) ?? 1.0;
          const age = (state.age as number) ?? 25;

          if (isYouth) {
            probabilities = {
              youth_breakout_eager: 0.72,
              determined_to_fight: 0.18,
              accepts_professionally: 0.08,
              unhappy_demoralized: 0.01,
              ambitious_eager: 0.01,
            };
          } else if (isKeyPlayer) {
            if (priceRatio < 0.95) {
              probabilities = {
                unhappy_demoralized: 0.68,
                accepts_professionally: 0.18,
                determined_to_fight: 0.10,
                ambitious_eager: 0.04,
                youth_breakout_eager: 0.0,
              };
            } else {
              probabilities = {
                unhappy_demoralized: 0.45,
                accepts_professionally: 0.30,
                ambitious_eager: 0.15,
                determined_to_fight: 0.10,
                youth_breakout_eager: 0.0,
              };
            }
          } else if (age >= 30) {
            probabilities = {
              accepts_professionally: 0.60,
              ambitious_eager: 0.22,
              unhappy_demoralized: 0.10,
              determined_to_fight: 0.08,
              youth_breakout_eager: 0.0,
            };
          } else {
            probabilities = {
              accepts_professionally: 0.42,
              ambitious_eager: 0.35,
              determined_to_fight: 0.15,
              unhappy_demoralized: 0.08,
              youth_breakout_eager: 0.0,
            };
          }
        } else {
          // Uniform / first-choice distribution for general questions
          const share = 1 / keys.length;
          keys.forEach((k) => {
            probabilities[k] = share;
          });
        }

        // Normalize probabilities for valid keys
        let bestKey = keys[0];
        let maxProb = -1;
        const normalizedProbs: Record<string, number> = {};

        keys.forEach((k) => {
          const p = probabilities[k] ?? 1 / keys.length;
          normalizedProbs[k] = p;
          if (p > maxProb) {
            maxProb = p;
            bestKey = k;
          }
        });

        answers[id] = {
          choice: bestKey,
          probabilities: normalizedProbs,
          confidence: Math.round(maxProb * 100) / 100,
        };
      } else if (q.type === 'score') {
        const levels = q.criteria;
        let score = Math.floor((levels.length - 1) / 2);
        if (id === 'hypeScore') {
          const isDerby = Boolean(state.isDerby);
          const isTopClash = Boolean(state.isTopClash);
          if (isDerby) score = Math.min(levels.length - 1, 4);
          else if (isTopClash) score = Math.min(levels.length - 1, 3);
          else score = 1;
        }
        answers[id] = {
          score,
          probabilities: {},
          confidence: 0.88,
        };
      } else if (q.type === 'noul') {
        answers[id] = {
          noul: 0.55,
        };
      }
    }

    return { answers };
  }

  /**
   * Generates a player's reaction when listed for sale, leveraging Jev's
   * choice inference with calibrated local fallback.
   */
  public static async generatePlayerListingReaction(params: {
    playerName: string;
    age: number;
    rating: number;
    value: number;
    askingPrice?: number | null;
    isYouth?: boolean;
    clubName?: string;
  }): Promise<{ sentiment: string; quote: string; morale: string }> {
    const isYouth = Boolean(params.isYouth || params.age <= 20);
    const isKeyPlayer = params.rating >= 78;
    const askingPrice = params.askingPrice ?? params.value;
    const priceRatio = params.value > 0 ? askingPrice / params.value : 1.0;

    const response = await this.ask(
      {
        playerName: params.playerName,
        age: params.age,
        rating: params.rating,
        value: params.value,
        askingPrice,
        priceRatio,
        isYouth,
        isKeyPlayer,
        clubName: params.clubName ?? 'the club',
      },
      {
        playerListingReaction: {
          type: 'choice',
          instructions: 'Evaluate player reaction to being placed on the transfer market.',
          criteria: {
            youth_breakout_eager: 'Eager academy youngster seeking senior minutes and breakout opportunity.',
            unhappy_demoralized: 'Frustrated key player feeling disrespected or pushed out.',
            accepts_professionally: 'Pragmatic professional understanding squad economics.',
            ambitious_eager: 'Excited for a new challenge and potential upgrade.',
            determined_to_fight: 'Determined to prove their worth and win back manager trust.',
          },
        },
      }
    );

    const answer = response.answers['playerListingReaction'] as ChoiceAnswer;
    const sentiment = answer?.choice ?? (isYouth ? 'youth_breakout_eager' : 'accepts_professionally');

    let quote = '';
    let morale = 'Content';

    switch (sentiment) {
      case 'youth_breakout_eager':
        quote = "I've worked hard in the academy and I'm hungry for senior minutes. If the opportunity is elsewhere, I'm ready to make my mark.";
        morale = 'Very High';
        break;
      case 'unhappy_demoralized':
        quote = "I've put my heart into this squad. Being put in the shop window feels like a lack of faith, but I have to look out for my future.";
        morale = 'Low';
        break;
      case 'ambitious_eager':
        quote = "I appreciate everything here, but I'm excited by the prospect of a new challenge and testing myself at another club.";
        morale = 'High';
        break;
      case 'determined_to_fight':
        quote = "The manager might have listed me, but every day in training I'll be working to show I still have a major role to play here.";
        morale = 'Determined';
        break;
      case 'accepts_professionally':
      default:
        quote = "The manager was upfront about the club needing to raise funds. Football is a business, and I'll remain completely professional until a deal happens.";
        morale = 'Content';
        break;
    }

    return { sentiment, quote, morale };
  }
}

