import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { UserEntity } from "../../../database/entities/user.entity";

/** Data required to create a new user */
export interface CreateUserData {
  email?: string;
  phone?: string;
  accountType?: "individual" | "business";
}

/** Data that can be updated on an existing user */
export interface UpdateUserData {
  hederaAccountId?: string;
  accountType?: "individual" | "business";
  email?: string;
  phone?: string;
  displayName?: string;
  bio?: string;
  avatarIpfsCid?: string;
  status?: string;
  kycLevel?: string;
  didNftSerial?: number;
  didNftMetadataCid?: string;
  publicFeedTopic?: string;
  notificationTopic?: string;
  broadcastTopic?: string;
  publicKey?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Create a new user in the database.
   * Generates a UUID, sets initial status to 'pending_wallet',
   * defaults accountType to 'individual'.
   */
  async create(data: CreateUserData): Promise<UserEntity> {
    const entityData: DeepPartial<UserEntity> = {
      id: uuidv4(),
      email: data.email,
      phone: data.phone,
      accountType: data.accountType ?? "individual",
      status: "pending_wallet",
    };

    const user = this.userRepository.create(entityData);
    const savedUser = await this.userRepository.save(user);
    this.logger.log(`User created: ${savedUser.id}`);
    return savedUser;
  }

  /**
   * Find a user by email or phone.
   * At least one parameter must be provided.
   */
  async findByEmailOrPhone(
    email?: string,
    phone?: string,
  ): Promise<UserEntity | null> {
    if (!email && !phone) {
      return null;
    }

    const queryBuilder = this.userRepository.createQueryBuilder("user");

    if (email && phone) {
      queryBuilder.where("user.email = :email OR user.phone = :phone", {
        email,
        phone,
      });
    } else if (email) {
      queryBuilder.where("user.email = :email", { email });
    } else {
      queryBuilder.where("user.phone = :phone", { phone });
    }

    return queryBuilder.getOne();
  }

  /**
   * Find a user by their UUID.
   */
  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * Find a user by UUID or throw NotFoundException.
   */
  async findByIdOrFail(id: string): Promise<UserEntity> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    return user;
  }

  /**
   * Hard-delete a user by ID. Used to roll back a failed registration.
   */
  async delete(id: string): Promise<void> {
    await this.userRepository.delete(id);
    this.logger.log(`User deleted (rollback): ${id}`);
  }

  /**
   * Update a user's fields.
   */
  async update(id: string, data: UpdateUserData): Promise<UserEntity> {
    await this.userRepository.update(id, data);
    const updated = await this.findByIdOrFail(id);
    this.logger.log(`User updated: ${id}`);
    return updated;
  }
}
