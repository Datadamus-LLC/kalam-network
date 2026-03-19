import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";

@Entity("business_profiles")
export class BusinessProfileEntity {
  @PrimaryColumn("uuid")
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "varchar", length: 128, nullable: true })
  companyName!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  registrationNumber!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  businessCategory!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  kybLevel!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  website!: string;

  @Column({ type: "jsonb", nullable: true })
  businessHours!: Record<string, string>; // { "mon": "9:00-17:00", ... }

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;
}
