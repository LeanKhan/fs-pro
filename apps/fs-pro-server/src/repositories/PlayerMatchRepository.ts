import { PlayerMatchDetailsInterface } from '../controllers/player-match/player-match.model';

export interface IPlayerMatchRepository {
  findById(id: string): Promise<PlayerMatchDetailsInterface | null>;
  createMany(data: Partial<PlayerMatchDetailsInterface>[]): Promise<PlayerMatchDetailsInterface[]>;
  update(id: string, data: Partial<PlayerMatchDetailsInterface>): Promise<PlayerMatchDetailsInterface | null>;
  delete(id: string): Promise<PlayerMatchDetailsInterface>;
}
