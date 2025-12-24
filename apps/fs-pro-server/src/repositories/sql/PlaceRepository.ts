import { IPlaceRepository } from '../PlaceRepository';
import { PostgreSQLDatabase } from '../../db/postgresql';
import { IPlace } from '../../controllers/places/places.model';

export class SQLPlaceRepository implements IPlaceRepository {
  private prisma = (PostgreSQLDatabase.getInstance().getConnection() as any);

  async findById(id: string): Promise<IPlace | null> {
    return this.prisma.place.findUnique({ where: { id } });
  }

  async findAll(): Promise<IPlace[]> {
    return this.prisma.place.findMany();
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