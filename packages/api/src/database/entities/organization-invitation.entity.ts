import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { OrganizationEntity } from "./organization.entity";
import { UserEntity } from "./user.entity";

@Entity("organization_invitations")
@Index("idx_org_invitations_org", ["organizationId"])
@Index("idx_org_invitations_token", ["token"])
@Index("idx_org_invitations_email", ["email"])
export class OrganizationInvitationEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  organizationId!: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "organization_id" })
  organization!: OrganizationEntity;

  @Column({ type: "varchar", length: 256 })
  email!: string;

  @Column({ type: "varchar", length: 20, default: "member" })
  role!: "admin" | "member" | "viewer";

  @Column({ type: "uuid" })
  invitedBy!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invited_by" })
  inviter!: UserEntity;

  @Column({ type: "varchar", length: 20, default: "pending" })
  status!: "pending" | "accepted" | "expired" | "revoked";

  @Column({ type: "varchar", length: 128, unique: true })
  token!: string;

  @Column({ type: "timestamp with time zone" })
  expiresAt!: Date;

  @CreateDateColumn({ type: "timestamp with time zone" })
  createdAt!: Date;
}
