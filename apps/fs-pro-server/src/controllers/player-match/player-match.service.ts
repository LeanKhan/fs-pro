import { PlayerMatchDetailsInterface } from './player-match.model';
import { PlayerMatchRepositoryFactory } from '../../repositories/PlayerMatchRepositoryFactory';

let playerMatchRepo: ReturnType<
  typeof PlayerMatchRepositoryFactory.create
> | null = null;

function getPlayerMatchRepo() {
  if (!playerMatchRepo) {
    playerMatchRepo = PlayerMatchRepositoryFactory.create();
  }
  return playerMatchRepo;
}

export async function getPlayerMatchById(id: string) {
  return getPlayerMatchRepo().findById(id);
}

export async function createManyPlayerMatches(
  data: Partial<PlayerMatchDetailsInterface>[]
) {
  return getPlayerMatchRepo().createMany(data);
}

export async function updatePlayerMatchFields(
  id: string,
  data: Partial<PlayerMatchDetailsInterface>
) {
  return getPlayerMatchRepo().update(id, data);
}

export async function deletePlayerMatchById(id: string) {
  return getPlayerMatchRepo().delete(id);
}
