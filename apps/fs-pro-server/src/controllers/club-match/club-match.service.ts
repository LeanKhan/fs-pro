import { ClubMatchDetailsInterface } from './club-match.model';
import { ClubMatchRepositoryFactory } from '../../repositories/ClubMatchRepositoryFactory';

let clubMatchRepo: ReturnType<typeof ClubMatchRepositoryFactory.create> | null =
  null;

function getClubMatchRepo() {
  if (!clubMatchRepo) {
    clubMatchRepo = ClubMatchRepositoryFactory.create();
  }
  return clubMatchRepo;
}

export async function getClubMatchById(id: string) {
  return getClubMatchRepo().findById(id);
}

export async function createClubMatch(
  data: Partial<ClubMatchDetailsInterface>
) {
  return getClubMatchRepo().create(data);
}

export async function updateClubMatchFields(
  id: string,
  data: Partial<ClubMatchDetailsInterface>
) {
  return getClubMatchRepo().update(id, data);
}

export async function deleteClubMatchById(id: string) {
  return getClubMatchRepo().delete(id);
}
