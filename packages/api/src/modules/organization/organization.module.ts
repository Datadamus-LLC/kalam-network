import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrganizationEntity } from "../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../database/entities/organization-member.entity";
import { OrganizationInvitationEntity } from "../../database/entities/organization-invitation.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { HederaModule } from "../hedera/hedera.module";
import { IdentityModule } from "../identity/identity.module";
import { OrganizationController } from "./organization.controller";
import { OrganizationService } from "./organization.service";
import { OrgPermissionGuard } from "./guards/org-permission.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationEntity,
      OrganizationMemberEntity,
      OrganizationInvitationEntity,
      UserEntity,
    ]),
    AuthModule,
    HederaModule,
    IdentityModule,
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrgPermissionGuard],
  exports: [OrganizationService],
})
export class OrganizationModule {}
