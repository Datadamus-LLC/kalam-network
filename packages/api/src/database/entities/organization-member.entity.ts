import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from "typeorm";
import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

@Entity("organization_members")
@Unique("uq_org_members_org_user", ["organizationId", "userId"])
@Index("idx_org_members_user", ["userId"])
@Index("idx_org_members_org", ["organizationId"])
export class OrganizationMemberEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  organizationId!: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: OrganizationEntity;

  @Column({ type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ type: "varchar", length: 20 })
  role!: "owner" | "admin" | "member" | "viewer";

  @Column({ type: "uuid", nullable: true })
  invitedBy!: string;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "invited_by" })
  inviter!: UserEntity;

  @CreateDateColumn({ type: "timestamp with time zone" })
  joinedAt!: Date;
}
