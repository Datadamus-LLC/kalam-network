/**
 * Comprehensive DTO Validation Tests — ALL modules.
 *
 * Uses real class-validator `validate()` calls against real DTO instances.
 * NO mocks. NO stubs. NO fakes. Real class-transformer + class-validator pipeline.
 */
import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";

// Messaging DTOs
import { SendMessageDto } from "./messaging/dto/send-message.dto";
import { CreateConversationDto } from "./messaging/dto/create-conversation.dto";
import { AddParticipantDto } from "./messaging/dto/add-participant.dto";
import { GetConversationsQueryDto } from "./messaging/dto/get-conversations-query.dto";
import { GetMessagesQueryDto } from "./messaging/dto/get-messages-query.dto";

// Social DTOs
import { CreatePostDto, MediaUploadDto } from "./social/dto/create-post.dto";
import { FollowUserDto, UnfollowUserDto } from "./social/dto/follow.dto";
import { FeedQueryDto } from "./social/dto/feed-query.dto";

// Payment DTOs
import { SendPaymentDto } from "./payments/dto/send-payment.dto";
import { PaymentHistoryQueryDto } from "./payments/dto/payment-history-query.dto";
import { TransactionQueryDto } from "./payments/dto/transaction-query.dto";
import {
  RequestPaymentDto,
  FulfillPaymentRequestDto,
  DeclinePaymentRequestDto,
  PaymentRequestQueryDto,
} from "./payments/dto/request-payment.dto";
import { CreateSplitPaymentDto } from "./payments/dto/split-payment.dto";

// Organization DTOs
import { CreateInvitationDto } from "./organization/dto/create-invitation.dto";
import { UpdateOrgProfileDto } from "./organization/dto/update-org-profile.dto";
import { UpdateMemberRoleDto } from "./organization/dto/update-member-role.dto";

// Identity DTOs
import { HederaAccountIdParam } from "./identity/dto/hedera-account-id.dto";
import { SearchUsersDto } from "./identity/dto/search-users.dto";
import { UpdateProfileDto } from "./identity/dto/update-profile.dto";
import {
  IndividualKycSubmitDto,
  CorporateKycSubmitDto,
  KycDocumentDataDto,
  KycComplianceDataDto,
  BeneficialOwnerDto,
  CorporateComplianceDataDto,
} from "./identity/dto/kyc-submit.dto";
import { MirsadKycCallbackDto } from "./identity/dto/kyc-callback.dto";

/**
 * Helper: validate plain object → DTO instance (mirrors the NestJS pipeline).
 */
function toDto<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): T {
  return plainToInstance(cls, plain);
}

// ─────────────────────────────────────────────────────────────────────────────
// Messaging DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe("SendMessageDto", () => {
  it("accepts valid message", async () => {
    const dto = toDto(SendMessageDto, { text: "Hello world" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts message with optional fields", async () => {
    const dto = toDto(SendMessageDto, {
      text: "Hello",
      mediaRef: "QmTestCid123",
      replyToSequence: 5,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects empty text", async () => {
    const dto = toDto(SendMessageDto, { text: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects missing text", async () => {
    const dto = toDto(SendMessageDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects non-integer replyToSequence", async () => {
    const dto = toDto(SendMessageDto, { text: "Hi", replyToSequence: 1.5 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects replyToSequence below 1", async () => {
    const dto = toDto(SendMessageDto, { text: "Hi", replyToSequence: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("CreateConversationDto", () => {
  it("accepts valid direct conversation", async () => {
    const dto = toDto(CreateConversationDto, {
      participantAccountIds: ["0.0.12345"],
      type: "direct",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid group conversation", async () => {
    const dto = toDto(CreateConversationDto, {
      participantAccountIds: ["0.0.12345", "0.0.67890"],
      type: "group",
      groupName: "Test Group",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects empty participantAccountIds", async () => {
    const dto = toDto(CreateConversationDto, {
      participantAccountIds: [],
      type: "direct",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid Hedera account ID", async () => {
    const dto = toDto(CreateConversationDto, {
      participantAccountIds: ["invalid-id"],
      type: "direct",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid conversation type", async () => {
    const dto = toDto(CreateConversationDto, {
      participantAccountIds: ["0.0.12345"],
      type: "invalid",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("AddParticipantDto", () => {
  it("accepts valid Hedera account ID", async () => {
    const dto = toDto(AddParticipantDto, { accountId: "0.0.54321" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid account ID format", async () => {
    const dto = toDto(AddParticipantDto, { accountId: "not-valid" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects empty accountId", async () => {
    const dto = toDto(AddParticipantDto, { accountId: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("GetConversationsQueryDto", () => {
  it("accepts empty query (all optional)", async () => {
    const dto = toDto(GetConversationsQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid limit and cursor", async () => {
    const dto = plainToInstance(GetConversationsQueryDto, {
      limit: 50,
      cursor: "2026-01-01T00:00:00Z",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects limit above 100", async () => {
    const dto = plainToInstance(GetConversationsQueryDto, { limit: 101 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects limit below 1", async () => {
    const dto = plainToInstance(GetConversationsQueryDto, { limit: 0 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("GetMessagesQueryDto", () => {
  it("accepts empty query", async () => {
    const dto = toDto(GetMessagesQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts numeric string limit", async () => {
    const dto = toDto(GetMessagesQueryDto, { limit: "50", cursor: "abc" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects non-numeric limit", async () => {
    const dto = toDto(GetMessagesQueryDto, { limit: "not-a-number" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Social DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe("CreatePostDto", () => {
  it("accepts valid post with text only", async () => {
    const dto = toDto(CreatePostDto, { text: "Hello world" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts post with media", async () => {
    const dto = plainToInstance(CreatePostDto, {
      text: "Check this out",
      media: [
        {
          type: "image",
          ipfsCid: "QmTestCid",
          mimeType: "image/png",
          size: 1024,
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects empty text", async () => {
    const dto = toDto(CreatePostDto, { text: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects text exceeding 800 characters", async () => {
    const dto = toDto(CreatePostDto, { text: "x".repeat(801) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("MediaUploadDto", () => {
  it("accepts valid image upload", async () => {
    const dto = toDto(MediaUploadDto, {
      type: "image",
      ipfsCid: "QmTestCid",
      mimeType: "image/png",
      size: 1024,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts video with optional fields", async () => {
    const dto = toDto(MediaUploadDto, {
      type: "video",
      ipfsCid: "QmTestCid",
      mimeType: "video/mp4",
      size: 5000,
      dimensions: "1920x1080",
      alt: "Test video",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid media type", async () => {
    const dto = toDto(MediaUploadDto, {
      type: "audio",
      ipfsCid: "QmTestCid",
      mimeType: "audio/mp3",
      size: 100,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects non-positive size", async () => {
    const dto = toDto(MediaUploadDto, {
      type: "image",
      ipfsCid: "QmTestCid",
      mimeType: "image/png",
      size: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("FollowUserDto", () => {
  it("accepts valid Hedera account ID", async () => {
    const dto = toDto(FollowUserDto, { targetAccountId: "0.0.12345" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects non-Hedera format", async () => {
    const dto = toDto(FollowUserDto, { targetAccountId: "1.2.3" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects empty string", async () => {
    const dto = toDto(FollowUserDto, { targetAccountId: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("UnfollowUserDto", () => {
  it("accepts valid Hedera account ID", async () => {
    const dto = toDto(UnfollowUserDto, { targetAccountId: "0.0.99999" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid format", async () => {
    const dto = toDto(UnfollowUserDto, { targetAccountId: "abc" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("FeedQueryDto", () => {
  it("accepts empty query (all optional with defaults)", async () => {
    const dto = toDto(FeedQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid cursor and limit", async () => {
    const dto = plainToInstance(FeedQueryDto, {
      cursor: "some-cursor",
      limit: 50,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects limit above 100", async () => {
    const dto = plainToInstance(FeedQueryDto, { limit: 101 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Payment DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe("SendPaymentDto", () => {
  it("accepts valid payment", async () => {
    const dto = toDto(SendPaymentDto, {
      recipientAccountId: "0.0.12345",
      amount: 10,
      currency: "HBAR",
      topicId: "0.0.67890",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts payment with optional note", async () => {
    const dto = toDto(SendPaymentDto, {
      recipientAccountId: "0.0.12345",
      amount: 1.5,
      currency: "USDC",
      topicId: "0.0.67890",
      note: "Thanks!",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid recipient account ID", async () => {
    const dto = toDto(SendPaymentDto, {
      recipientAccountId: "not-valid",
      amount: 10,
      currency: "HBAR",
      topicId: "0.0.67890",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects amount below minimum", async () => {
    const dto = toDto(SendPaymentDto, {
      recipientAccountId: "0.0.12345",
      amount: 0.001,
      currency: "HBAR",
      topicId: "0.0.67890",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid topic ID", async () => {
    const dto = toDto(SendPaymentDto, {
      recipientAccountId: "0.0.12345",
      amount: 10,
      currency: "HBAR",
      topicId: "bad-id",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("RequestPaymentDto", () => {
  it("accepts valid request", async () => {
    const dto = toDto(RequestPaymentDto, {
      amount: 50,
      currency: "HBAR",
      topicId: "0.0.12345",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts request with optional fields", async () => {
    const dto = toDto(RequestPaymentDto, {
      amount: 50,
      currency: "USDC",
      topicId: "0.0.12345",
      description: "Lunch money",
      expiresAt: "2026-12-31T23:59:59.000Z",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid expiresAt format", async () => {
    const dto = toDto(RequestPaymentDto, {
      amount: 50,
      currency: "HBAR",
      topicId: "0.0.12345",
      expiresAt: "not-a-date",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("FulfillPaymentRequestDto", () => {
  it("accepts valid topic ID", async () => {
    const dto = toDto(FulfillPaymentRequestDto, { topicId: "0.0.12345" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid topic ID", async () => {
    const dto = toDto(FulfillPaymentRequestDto, { topicId: "invalid" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("DeclinePaymentRequestDto", () => {
  it("accepts empty (all optional)", async () => {
    const dto = toDto(DeclinePaymentRequestDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts with reason", async () => {
    const dto = toDto(DeclinePaymentRequestDto, {
      reason: "Not enough funds",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe("PaymentRequestQueryDto", () => {
  it("accepts empty query", async () => {
    const dto = toDto(PaymentRequestQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid UUID conversationId", async () => {
    const dto = toDto(PaymentRequestQueryDto, {
      conversationId: "123e4567-e89b-12d3-a456-426614174000",
      status: "pending",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid UUID conversationId", async () => {
    const dto = toDto(PaymentRequestQueryDto, {
      conversationId: "not-a-uuid",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("PaymentHistoryQueryDto", () => {
  it("accepts empty query", async () => {
    const dto = toDto(PaymentHistoryQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts numeric string limit", async () => {
    const dto = toDto(PaymentHistoryQueryDto, { limit: "20", cursor: "abc" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects non-numeric limit", async () => {
    const dto = toDto(PaymentHistoryQueryDto, { limit: "xyz" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("TransactionQueryDto", () => {
  it("accepts empty query", async () => {
    const dto = toDto(TransactionQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts all valid filters", async () => {
    const dto = toDto(TransactionQueryDto, {
      direction: "sent",
      status: "completed",
      from: "2026-01-01",
      to: "2026-12-31",
      search: "0.0.12345",
      limit: "50",
      cursor: "cursor-token",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid direction", async () => {
    const dto = toDto(TransactionQueryDto, { direction: "up" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid status", async () => {
    const dto = toDto(TransactionQueryDto, { status: "unknown" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid date format", async () => {
    const dto = toDto(TransactionQueryDto, { from: "not-a-date" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("CreateSplitPaymentDto", () => {
  it("accepts valid split payment (equal)", async () => {
    const dto = toDto(CreateSplitPaymentDto, {
      totalAmount: 100,
      currency: "HBAR",
      splitMethod: "equal",
      participantAccountIds: ["0.0.12345", "0.0.67890"],
      topicId: "0.0.11111",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts custom split with amounts", async () => {
    const dto = toDto(CreateSplitPaymentDto, {
      totalAmount: 100,
      currency: "USDC",
      splitMethod: "custom",
      participantAccountIds: ["0.0.12345"],
      topicId: "0.0.11111",
      note: "Custom split",
      customAmounts: { "0.0.12345": 60 },
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects empty participants", async () => {
    const dto = toDto(CreateSplitPaymentDto, {
      totalAmount: 100,
      currency: "HBAR",
      splitMethod: "equal",
      participantAccountIds: [],
      topicId: "0.0.11111",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid split method", async () => {
    const dto = toDto(CreateSplitPaymentDto, {
      totalAmount: 100,
      currency: "HBAR",
      splitMethod: "random",
      participantAccountIds: ["0.0.12345"],
      topicId: "0.0.11111",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects amount below minimum", async () => {
    const dto = toDto(CreateSplitPaymentDto, {
      totalAmount: 0.001,
      currency: "HBAR",
      splitMethod: "equal",
      participantAccountIds: ["0.0.12345"],
      topicId: "0.0.11111",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Organization DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe("CreateInvitationDto", () => {
  it("accepts valid invitation", async () => {
    const dto = toDto(CreateInvitationDto, {
      email: "user@example.com",
      role: "member",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts invitation with optional message", async () => {
    const dto = toDto(CreateInvitationDto, {
      email: "admin@org.com",
      role: "admin",
      message: "Welcome to the org!",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid email", async () => {
    const dto = toDto(CreateInvitationDto, {
      email: "not-an-email",
      role: "member",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid role", async () => {
    const dto = toDto(CreateInvitationDto, {
      email: "user@example.com",
      role: "superadmin",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("UpdateOrgProfileDto", () => {
  it("accepts empty update (all optional)", async () => {
    const dto = toDto(UpdateOrgProfileDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts full update", async () => {
    const dto = toDto(UpdateOrgProfileDto, {
      name: "My Org",
      bio: "A great org",
      category: "tech",
      website: "https://example.com",
      businessHours: { mon: "9:00-17:00" },
      logoCid: "QmTestLogo",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects name exceeding 128 chars", async () => {
    const dto = toDto(UpdateOrgProfileDto, { name: "x".repeat(129) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid website URL", async () => {
    const dto = toDto(UpdateOrgProfileDto, { website: "not-a-url" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("UpdateMemberRoleDto", () => {
  it("accepts valid role", async () => {
    const dto = toDto(UpdateMemberRoleDto, { role: "admin" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts viewer role", async () => {
    const dto = toDto(UpdateMemberRoleDto, { role: "viewer" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid role", async () => {
    const dto = toDto(UpdateMemberRoleDto, { role: "owner" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Identity DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe("HederaAccountIdParam", () => {
  it("accepts valid Hedera account ID", async () => {
    const dto = toDto(HederaAccountIdParam, { hederaAccountId: "0.0.12345" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid format", async () => {
    const dto = toDto(HederaAccountIdParam, { hederaAccountId: "abc" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects empty string", async () => {
    const dto = toDto(HederaAccountIdParam, { hederaAccountId: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("SearchUsersDto", () => {
  it("accepts valid search query", async () => {
    const dto = toDto(SearchUsersDto, { q: "test" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects query shorter than 2 chars", async () => {
    const dto = toDto(SearchUsersDto, { q: "x" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects query longer than 100 chars", async () => {
    const dto = toDto(SearchUsersDto, { q: "x".repeat(101) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts optional numeric limit", async () => {
    const dto = toDto(SearchUsersDto, { q: "test", limit: "20" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

describe("UpdateProfileDto", () => {
  it("accepts empty update (all optional)", async () => {
    const dto = toDto(UpdateProfileDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid display name", async () => {
    const dto = toDto(UpdateProfileDto, { displayName: "Test User" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts bio and location", async () => {
    const dto = toDto(UpdateProfileDto, {
      displayName: "Test User",
      bio: "A short bio",
      location: "Dubai, UAE",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects bio exceeding 500 chars", async () => {
    const dto = toDto(UpdateProfileDto, { bio: "x".repeat(501) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects display name exceeding 100 chars", async () => {
    const dto = toDto(UpdateProfileDto, { displayName: "x".repeat(101) });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chat WebSocket DTOs
// ─────────────────────────────────────────────────────────────────────────────

import {
  JoinConversationDto,
  LeaveConversationDto,
  TypingDto,
  ReadReceiptDto,
} from "./chat/dto/ws-events.dto";

describe("JoinConversationDto", () => {
  it("accepts valid topicId", async () => {
    const dto = toDto(JoinConversationDto, { topicId: "0.0.12345" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects empty topicId", async () => {
    const dto = toDto(JoinConversationDto, { topicId: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("LeaveConversationDto", () => {
  it("accepts valid topicId", async () => {
    const dto = toDto(LeaveConversationDto, { topicId: "0.0.12345" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects empty topicId", async () => {
    const dto = toDto(LeaveConversationDto, { topicId: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("TypingDto", () => {
  it("accepts valid typing event", async () => {
    const dto = toDto(TypingDto, { topicId: "0.0.12345", isTyping: true });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects missing isTyping", async () => {
    const dto = toDto(TypingDto, { topicId: "0.0.12345" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects non-boolean isTyping", async () => {
    const dto = toDto(TypingDto, { topicId: "0.0.12345", isTyping: "yes" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("ReadReceiptDto", () => {
  it("accepts valid read receipt", async () => {
    const dto = toDto(ReadReceiptDto, {
      topicId: "0.0.12345",
      lastReadSequence: 10,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects lastReadSequence below 1", async () => {
    const dto = toDto(ReadReceiptDto, {
      topicId: "0.0.12345",
      lastReadSequence: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects non-integer lastReadSequence", async () => {
    const dto = toDto(ReadReceiptDto, {
      topicId: "0.0.12345",
      lastReadSequence: 1.5,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification DTOs
// ─────────────────────────────────────────────────────────────────────────────

import {
  GetNotificationsQueryDto,
  MarkNotificationsReadDto,
  NotificationCategory,
} from "./notifications/dto/notification.dto";

describe("GetNotificationsQueryDto", () => {
  it("accepts empty query (all optional)", async () => {
    const dto = toDto(GetNotificationsQueryDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid category filter", async () => {
    const dto = toDto(GetNotificationsQueryDto, {
      category: NotificationCategory.PAYMENT,
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid limit and cursor", async () => {
    const dto = plainToInstance(GetNotificationsQueryDto, {
      limit: 50,
      cursor: "some-cursor",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid category", async () => {
    const dto = toDto(GetNotificationsQueryDto, { category: "unknown" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects limit above 100", async () => {
    const dto = plainToInstance(GetNotificationsQueryDto, { limit: 101 });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("MarkNotificationsReadDto", () => {
  it("accepts valid UUID v4 array", async () => {
    const dto = toDto(MarkNotificationsReadDto, {
      notificationIds: ["a3bb189e-8bf9-4ac1-a972-ef1c6b9e76b8"],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid UUID", async () => {
    const dto = toDto(MarkNotificationsReadDto, {
      notificationIds: ["not-a-uuid"],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth DTOs
// ─────────────────────────────────────────────────────────────────────────────

import { RegisterDto, hasContactMethod } from "./auth/dto/register.dto";
import { VerifyOtpDto } from "./auth/dto/verify-otp.dto";
import { RefreshTokenDto } from "./auth/dto/refresh-token.dto";

describe("RegisterDto", () => {
  it("accepts email registration", async () => {
    const dto = toDto(RegisterDto, { email: "user@example.com" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts phone registration", async () => {
    const dto = toDto(RegisterDto, { phone: "+971501234567" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts both email and phone", async () => {
    const dto = toDto(RegisterDto, {
      email: "user@example.com",
      phone: "+971501234567",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid email", async () => {
    const dto = toDto(RegisterDto, { email: "not-an-email" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects invalid phone format", async () => {
    const dto = toDto(RegisterDto, { phone: "1234567" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("hasContactMethod", () => {
  it("returns true when email is set", () => {
    expect(hasContactMethod({ email: "a@b.com" })).toBe(true);
  });

  it("returns true when phone is set", () => {
    expect(hasContactMethod({ phone: "+1234567890" })).toBe(true);
  });

  it("returns false when neither is set", () => {
    expect(hasContactMethod({})).toBe(false);
  });
});

describe("VerifyOtpDto", () => {
  it("accepts valid OTP with email", async () => {
    const dto = toDto(VerifyOtpDto, {
      email: "user@example.com",
      otp: "123456",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("accepts valid OTP with phone", async () => {
    const dto = toDto(VerifyOtpDto, {
      phone: "+971501234567",
      otp: "654321",
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects OTP shorter than 6 digits", async () => {
    const dto = toDto(VerifyOtpDto, { email: "a@b.com", otp: "12345" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects non-digit OTP", async () => {
    const dto = toDto(VerifyOtpDto, { email: "a@b.com", otp: "abcdef" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects OTP longer than 6 digits", async () => {
    const dto = toDto(VerifyOtpDto, { email: "a@b.com", otp: "1234567" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("RefreshTokenDto", () => {
  it("accepts valid refresh token", async () => {
    const dto = toDto(RefreshTokenDto, { refreshToken: "some-refresh-token" });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("rejects empty refresh token", async () => {
    const dto = toDto(RefreshTokenDto, { refreshToken: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth Response DTOs (class instantiation)
// ─────────────────────────────────────────────────────────────────────────────

import {
  AuthResponseDto,
  RegisterResponseDto,
  RefreshResponseDto,
} from "./auth/dto/auth-response.dto";

describe("AuthResponseDto", () => {
  it("can be instantiated with properties", () => {
    const dto = new AuthResponseDto();
    dto.accessToken = "token-abc";
    dto.refreshToken = "refresh-abc";
    dto.status = "active";
    dto.identifier = "user@example.com";
    expect(dto.accessToken).toBe("token-abc");
    expect(dto.status).toBe("active");
  });
});

describe("RegisterResponseDto", () => {
  it("can be instantiated", () => {
    const dto = new RegisterResponseDto();
    dto.registrationId = "reg-123";
    dto.otpSent = true;
    dto.expiresAt = "2026-12-31T23:59:59Z";
    expect(dto.registrationId).toBe("reg-123");
    expect(dto.otpSent).toBe(true);
  });
});

describe("RefreshResponseDto", () => {
  it("can be instantiated", () => {
    const dto = new RefreshResponseDto();
    dto.accessToken = "new-access-token";
    expect(dto.accessToken).toBe("new-access-token");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Message Response mapper function
// ─────────────────────────────────────────────────────────────────────────────

import { toMessageResponse } from "./messaging/dto/message-response.dto";

describe("toMessageResponse", () => {
  it("maps entity to response with ISO timestamp", () => {
    const timestamp = new Date("2026-03-13T12:00:00Z");
    const result = toMessageResponse({
      id: "msg-1",
      hcsTopicId: "0.0.12345",
      sequenceNumber: 42,
      senderAccountId: "0.0.54321",
      messageType: "text",
      hasMedia: false,
      consensusTimestamp: timestamp,
    });

    expect(result.id).toBe("msg-1");
    expect(result.hcsTopicId).toBe("0.0.12345");
    expect(result.sequenceNumber).toBe(42);
    expect(result.senderAccountId).toBe("0.0.54321");
    expect(result.messageType).toBe("text");
    expect(result.hasMedia).toBe(false);
    expect(result.consensusTimestamp).toBe("2026-03-13T12:00:00.000Z");
  });

  it("maps entity with media", () => {
    const result = toMessageResponse({
      id: "msg-2",
      hcsTopicId: "0.0.99999",
      sequenceNumber: 1,
      senderAccountId: "0.0.11111",
      messageType: "media",
      hasMedia: true,
      consensusTimestamp: new Date("2026-01-01T00:00:00Z"),
    });

    expect(result.hasMedia).toBe(true);
    expect(result.messageType).toBe("media");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification enums (exercising enum values for coverage)
// ─────────────────────────────────────────────────────────────────────────────

import { NotificationEvent } from "./notifications/dto/notification.dto";

describe("NotificationCategory and NotificationEvent enums", () => {
  it("has correct category values", () => {
    expect(NotificationCategory.MESSAGE).toBe("message");
    expect(NotificationCategory.PAYMENT).toBe("payment");
    expect(NotificationCategory.SOCIAL).toBe("social");
    expect(NotificationCategory.SYSTEM).toBe("system");
  });

  it("has correct event values", () => {
    expect(NotificationEvent.NEW_MESSAGE).toBe("new_message");
    expect(NotificationEvent.PAYMENT_RECEIVED).toBe("payment_received");
    expect(NotificationEvent.NEW_FOLLOWER).toBe("new_follower");
    expect(NotificationEvent.KYC_APPROVED).toBe("kyc_approved");
    expect(NotificationEvent.ANNOUNCEMENT).toBe("announcement");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Identity KYC DTOs
// ─────────────────────────────────────────────────────────────────────────────

describe("KycDocumentDataDto", () => {
  it("accepts valid document data", async () => {
    const dto = toDto(KycDocumentDataDto, {
      documentType: "passport",
      documentFrontRef: "https://storage.example.com/front.jpg",
      documentBackRef: "https://storage.example.com/back.jpg",
      selfieImageRef: "https://storage.example.com/selfie.jpg",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts empty object (all optional)", async () => {
    const dto = toDto(KycDocumentDataDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid documentType", async () => {
    const dto = toDto(KycDocumentDataDto, {
      documentType: "invalid_type",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe("documentType");
  });

  it("accepts all valid document types", async () => {
    for (const docType of ["passport", "drivers_license", "national_id"]) {
      const dto = toDto(KycDocumentDataDto, { documentType: docType });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });
});

describe("KycComplianceDataDto", () => {
  it("accepts valid compliance data", async () => {
    const dto = toDto(KycComplianceDataDto, {
      sourceOfFundsDeclaration: "employment",
      sourceOfFundsDetails: "Monthly salary from employer",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts empty object (all optional)", async () => {
    const dto = toDto(KycComplianceDataDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe("IndividualKycSubmitDto", () => {
  const validIndividual = {
    accountType: "individual",
    fullLegalName: "John Doe",
    dateOfBirth: "1990-01-15",
    nationality: "US",
    countryOfResidence: "US",
    currentResidentialAddress: "123 Main St, New York, 10001, US",
    nationalIdNumber: "123456789",
    cityOfBirth: "New York",
    countryOfBirth: "US",
  };

  it("accepts valid individual KYC with required fields only", async () => {
    const dto = toDto(IndividualKycSubmitDto, validIndividual);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts valid individual KYC with all optional fields", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      gender: "M",
      email: "john@example.com",
      phoneNumber: "+1234567890",
      passportNumber: "AB1234567",
      occupation: "Engineer",
      businessType: "Technology",
      industry: "Software",
      declaredIncome: 120000,
      netWorth: 500000,
      currencyInput: "USD",
      documentData: {
        documentType: "passport",
        documentFrontRef: "https://storage.example.com/front.jpg",
      },
      complianceData: {
        sourceOfFundsDeclaration: "employment",
      },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing required fields", async () => {
    const dto = toDto(IndividualKycSubmitDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(8);
  });

  it("rejects invalid accountType", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      accountType: "business",
    });
    const errors = await validate(dto);
    const accountTypeError = errors.find((e) => e.property === "accountType");
    expect(accountTypeError).toBeDefined();
  });

  it("rejects invalid dateOfBirth format", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      dateOfBirth: "01-15-1990",
    });
    const errors = await validate(dto);
    const dobError = errors.find((e) => e.property === "dateOfBirth");
    expect(dobError).toBeDefined();
  });

  it("rejects nationality longer than 2 characters", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      nationality: "USA",
    });
    const errors = await validate(dto);
    const nationalityError = errors.find((e) => e.property === "nationality");
    expect(nationalityError).toBeDefined();
  });

  it("rejects invalid gender value", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      gender: "X",
    });
    const errors = await validate(dto);
    const genderError = errors.find((e) => e.property === "gender");
    expect(genderError).toBeDefined();
  });

  it("rejects invalid email", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      email: "not-an-email",
    });
    const errors = await validate(dto);
    const emailError = errors.find((e) => e.property === "email");
    expect(emailError).toBeDefined();
  });

  it("rejects fullLegalName longer than 255 characters", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      fullLegalName: "A".repeat(256),
    });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === "fullLegalName");
    expect(nameError).toBeDefined();
  });

  it("rejects address longer than 500 characters", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      currentResidentialAddress: "A".repeat(501),
    });
    const errors = await validate(dto);
    const addressError = errors.find(
      (e) => e.property === "currentResidentialAddress",
    );
    expect(addressError).toBeDefined();
  });

  it("accepts female gender", async () => {
    const dto = toDto(IndividualKycSubmitDto, {
      ...validIndividual,
      gender: "F",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe("BeneficialOwnerDto", () => {
  const validOwner = {
    fullLegalName: "Jane Smith",
    dateOfBirth: "1985-06-20",
    nationality: "GB",
    countryOfResidence: "GB",
    currentResidentialAddress: "456 High St, London, EC1A 1BB, UK",
    nationalIdNumber: "GB987654321",
    cityOfBirth: "London",
    countryOfBirth: "GB",
  };

  it("accepts valid beneficial owner", async () => {
    const dto = toDto(BeneficialOwnerDto, validOwner);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts owner with optional fields", async () => {
    const dto = toDto(BeneficialOwnerDto, {
      ...validOwner,
      gender: "F",
      email: "jane@example.com",
      phoneNumber: "+447123456789",
      passportNumber: "GBR123456",
      occupation: "Director",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing required fields", async () => {
    const dto = toDto(BeneficialOwnerDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(7);
  });

  it("rejects invalid dateOfBirth format", async () => {
    const dto = toDto(BeneficialOwnerDto, {
      ...validOwner,
      dateOfBirth: "June 20, 1985",
    });
    const errors = await validate(dto);
    const dobError = errors.find((e) => e.property === "dateOfBirth");
    expect(dobError).toBeDefined();
  });
});

describe("CorporateComplianceDataDto", () => {
  it("accepts valid corporate compliance data", async () => {
    const dto = toDto(CorporateComplianceDataDto, {
      sourceOfFundsDeclaration: "business_revenue",
      sourceOfFundsDetails: "Revenue from software services",
      countriesOfOperation: ["US", "GB", "BH"],
      estimatedAnnualRevenueBhd: 1000000,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts empty object (all optional)", async () => {
    const dto = toDto(CorporateComplianceDataDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

describe("CorporateKycSubmitDto", () => {
  const validCorporate = {
    accountType: "business",
    legalEntityName: "Acme Corp LLC",
    countryOfIncorporation: "BH",
    businessRegistrationNumber: "CR-12345-2024",
    businessAddress: "123 Business Ave, Manama, 999, BH",
  };

  it("accepts valid corporate KYC with required fields only", async () => {
    const dto = toDto(CorporateKycSubmitDto, validCorporate);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts valid corporate KYC with all optional fields", async () => {
    const dto = toDto(CorporateKycSubmitDto, {
      ...validCorporate,
      primaryActivityDescription: "Software development and consulting",
      taxIdentificationNumber: "TAX-12345",
      tradeLicensesRef: "https://storage.example.com/license.pdf",
      email: "info@acme.com",
      phoneNumber: "+97317000000",
      businessType: "LLC",
      industry: "Technology",
      declaredIncome: 500000,
      netWorth: 2000000,
      currencyInput: "BHD",
      beneficialOwners: [
        {
          fullLegalName: "John Smith",
          dateOfBirth: "1980-03-15",
          nationality: "US",
          countryOfResidence: "BH",
          currentResidentialAddress: "789 Expat Lane, Manama, BH",
          nationalIdNumber: "USA123456",
          cityOfBirth: "Boston",
          countryOfBirth: "US",
        },
      ],
      documentData: {
        documentType: "national_id",
        documentFrontRef: "https://storage.example.com/front.jpg",
      },
      complianceData: {
        sourceOfFundsDeclaration: "business_revenue",
        countriesOfOperation: ["BH", "SA"],
        estimatedAnnualRevenueBhd: 500000,
      },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing required fields", async () => {
    const dto = toDto(CorporateKycSubmitDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects invalid accountType", async () => {
    const dto = toDto(CorporateKycSubmitDto, {
      ...validCorporate,
      accountType: "individual",
    });
    const errors = await validate(dto);
    const accountTypeError = errors.find((e) => e.property === "accountType");
    expect(accountTypeError).toBeDefined();
  });

  it("rejects invalid countryOfIncorporation (too long)", async () => {
    const dto = toDto(CorporateKycSubmitDto, {
      ...validCorporate,
      countryOfIncorporation: "BHR",
    });
    const errors = await validate(dto);
    const countryError = errors.find(
      (e) => e.property === "countryOfIncorporation",
    );
    expect(countryError).toBeDefined();
  });

  it("rejects invalid email in corporate KYC", async () => {
    const dto = toDto(CorporateKycSubmitDto, {
      ...validCorporate,
      email: "not-valid-email",
    });
    const errors = await validate(dto);
    const emailError = errors.find((e) => e.property === "email");
    expect(emailError).toBeDefined();
  });

  it("rejects legalEntityName longer than 255 characters", async () => {
    const dto = toDto(CorporateKycSubmitDto, {
      ...validCorporate,
      legalEntityName: "A".repeat(256),
    });
    const errors = await validate(dto);
    const nameError = errors.find((e) => e.property === "legalEntityName");
    expect(nameError).toBeDefined();
  });
});

describe("MirsadKycCallbackDto", () => {
  it("accepts valid callback with approved status", async () => {
    const dto = toDto(MirsadKycCallbackDto, {
      request_id: "req-abc-123",
      status: "approved",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts valid callback with rejected status", async () => {
    const dto = toDto(MirsadKycCallbackDto, {
      request_id: "req-def-456",
      status: "rejected",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts valid callback with on_hold status", async () => {
    const dto = toDto(MirsadKycCallbackDto, {
      request_id: "req-ghi-789",
      status: "on_hold",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects missing request_id", async () => {
    const dto = toDto(MirsadKycCallbackDto, {
      status: "approved",
    });
    const errors = await validate(dto);
    const idError = errors.find((e) => e.property === "request_id");
    expect(idError).toBeDefined();
  });

  it("rejects invalid status", async () => {
    const dto = toDto(MirsadKycCallbackDto, {
      request_id: "req-123",
      status: "pending",
    });
    const errors = await validate(dto);
    const statusError = errors.find((e) => e.property === "status");
    expect(statusError).toBeDefined();
  });

  it("rejects empty request_id", async () => {
    const dto = toDto(MirsadKycCallbackDto, {
      request_id: "",
      status: "approved",
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
