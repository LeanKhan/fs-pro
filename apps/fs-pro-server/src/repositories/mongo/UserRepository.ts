import { IUserRepository } from '../UserRepository';
import DB from '../../db';
import { IUser } from '../../controllers/user/user.model';
import { hashPassword } from '../../utils/auth';

export class MongoUserRepository implements IUserRepository {
  async findById(id: string): Promise<IUser | null> {
    return DB.Models.User.findById(id).lean().exec();
  }

  async findByUsername(username: string): Promise<IUser | null> {
    return DB.Models.User.findOne({ Username: username }).lean().exec();
  }

  async update(id: string, data: Partial<IUser>): Promise<IUser | null> {
    const update = { ...data };
    if (update.Password) {
      update.Password = await hashPassword(update.Password);
    }

    return DB.Models.User.findByIdAndUpdate(id, update, { new: true }).lean().exec();
  }
}
