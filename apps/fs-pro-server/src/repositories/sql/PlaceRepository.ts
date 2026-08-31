import { IPlaceRepository, IPlaceFilter } from '../PlaceRepository';
import { PostgreSQLDatabase } from '../../db/postgresql';
import { IPlace } from '../../controllers/places/places.model';

export class SQLPlaceRepository implements IPlaceRepository {
  private prisma: any;

  constructor(prisma = PostgreSQLDatabase.getInstance().getConnection()) {
    this.prisma = prisma as any;
  }

  async findById(id: string): Promise<IPlace | null> {
    return this.prisma.place.findUnique({ where: { id } });
  }

  async findAll(filter: IPlaceFilter = {}): Promise<IPlace[]> {
    return this.prisma.place.findMany({ where: filter });
  }

  async findByNameOrCode(value: string): Promise<IPlace | null> {
    return this.prisma.place.findFirst({
      where: { OR: [{ name: value }, { code: value }] },
    });
  }

  async create(data: Partial<IPlace>): Promise<IPlace> {
    return this.prisma.place.create({ data });
  }

  async update(id: string, data: Partial<IPlace>): Promise<IPlace> {
    return this.prisma.place.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.place.delete({ where: { id } });
  }
}
