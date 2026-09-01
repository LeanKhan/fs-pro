import { IFixtureRepository, IFixtureFilter } from '../FixtureRepository';
import DB from '../../db';
import { Fixture as FixtureInterface } from '../../controllers/fixtures/fixture.model';

const homePopulate = { path: 'HomeSideDetails', populate: { path: 'PlayerStats' } };
const awayPopulate = { path: 'AwaySideDetails', populate: { path: 'PlayerStats' } };

export class MongoFixtureRepository implements IFixtureRepository {
  async findById(id: string): Promise<FixtureInterface | null> {
    return DB.Models.Fixture.findById(id).populate(homePopulate).populate(awayPopulate).lean().exec();
  }

  async findAll(filter: IFixtureFilter = {}): Promise<FixtureInterface[]> {
    const { ids, ...rest } = filter;
    const query: Record<string, unknown> = { ...rest };
    if (ids !== undefined) {
      query._id = { $in: ids };
    }
    return DB.Models.Fixture.find(query).populate(homePopulate).populate(awayPopulate).lean().exec();
  }

  async create(data: Partial<FixtureInterface>): Promise<FixtureInterface> {
    const fixture = await DB.Models.Fixture.create(data);
    return fixture.toObject();
  }

  async update(id: string, data: Partial<FixtureInterface>): Promise<FixtureInterface | null> {
    return DB.Models.Fixture.findByIdAndUpdate(id, data, { new: true }).lean().exec();
  }

  async delete(id: string): Promise<FixtureInterface> {
    const doc = await DB.Models.Fixture.findById(id);
    if (!doc) {
      throw new Error(`Fixture [${id}] does not exist`);
    }
    // .remove() (not findByIdAndDelete) so the post('remove') hook fires -
    // see IFixtureRepository's doc comment.
    const removed = await doc.remove();
    return removed.toObject ? removed.toObject() : removed;
  }
}
