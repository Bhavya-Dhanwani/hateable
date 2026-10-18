// Importing modules
import User from '../../shared/models/user.model.js';
import Conflict from '../errors/Conflict.error.js';

// class to handle user data access operations
class UserDao {
  UserModel: typeof User;

  constructor() {
    // initializing the user model
    this.UserModel = User;
  }

  // function to create a new user
  async createUser(userData: Record<string, unknown>) {
    const user = await this.UserModel.create(userData);
    return user;
  }

  // function to find a user by email
  async findUserByEmail(email: string) {
    return await this.UserModel.findOne({ email });
  }

  // function to find a user by id
  async findUserById(id: string) {
    return await this.UserModel.findById(id);
  }

  // function to update a user by id
  async updateUserById(id: string, updateData: Record<string, unknown>) {
    return await this.UserModel.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });
  }

  // function to attach a verified phone; the unique index rejects a number another account holds
  async setVerifiedPhone(email: string, phone: string) {
    try {
      return await this.UserModel.findOneAndUpdate(
        { email },
        { phone, phoneVerified: true },
        { returnDocument: 'after' }
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new Conflict('This phone number is already linked to another account');
      }
      throw error;
    }
  }

  // function to link a Telegram account; the unique index rejects one linked to another account
  async setVerifiedTelegram(email: string, telegramId: string) {
    try {
      return await this.UserModel.findOneAndUpdate(
        { email },
        { telegramId, phoneVerified: true },
        { returnDocument: 'after' }
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new Conflict('This Telegram account is already linked to another account');
      }
      throw error;
    }
  }

  // function to delete a user by id
  async deleteUserById(id: string) {
    return await this.UserModel.findByIdAndDelete(id);
  }
}

export default UserDao;
