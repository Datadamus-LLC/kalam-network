import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { UserEntity } from "./user.entity";

@Entity("organizations")
@Index("idx_organizations_owner", ["ownerUserId"])
@Index("idx_organizations_hedera", ["hederaAccountId"])
export class OrganizationEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  ownerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "owner_user_id" })
  owner!: UserEntity;

  @Column({ type: "varchar", length: 128 })
  name!: string;

  @Column({ type: "varchar", length: 20 })
  hederaAccountId!: string; // dedicated org Hedera account (created during org setup)

  @Column({ type: "bigint", nullable: true })
  didNftSerial!: number; // org DID NFT serial

  @Column({ type: "varchar", length: 20, nullable: true })
  broadcastTopicId!: string; // migrated from business_profiles

  @Column({ type: "varchar", length: 128, nullable: true })
  logoCid!: string; // IPFS CID

  @Column({ type: "varchar", length: 256, nullable: true })
  bio!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  category!: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  website!: string;

  @Column({ type: "jsonb", nullable: true })
  businessHours!: Record<string, string>; // { "mon": "9:00-17:00", ... }

  @Column({ type: "varchar", length: 20 })
  kybStatus!: string; // 'pending' | 'verified' | 'certified'

  @Column({ type: "timestamp with time zone", nullable: true })
  kybVerifiedAt!: Date;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamp with time zone" })
  updatedAt!: Date;
}
