/**
 * Exception Coverage Integration Test
 *
 * Exercises EVERY exception constructor across ALL modules.
 * No mocking — real class instantiation, real property verification.
 *
 * For each exception class:
 *   1. Instantiate with required constructor args
 *   2. Verify instanceof Error
 *   3. Verify name property
 *   4. Verify message contains expected content
 *   5. For static factory methods, call them and verify
 */

// ---------------------------------------------------------------------------
// common/exceptions
// ---------------------------------------------------------------------------
import { BaseException } from "../common/exceptions/base.exception";

// ---------------------------------------------------------------------------
// hedera/exceptions
// ---------------------------------------------------------------------------
import {
  HederaClientNotInitializedException,
  HederaTopicCreationException,
  HederaMessageSubmissionException,
  HederaTransactionException,
  HederaNftMintException,
  HederaTransferException,
  MirrorNodeRequestException,
} from "./hedera/exceptions/hedera.exceptions";

// ---------------------------------------------------------------------------
// chat/exceptions
// ---------------------------------------------------------------------------
import {
  WsAuthenticationFailedException,
  WsTokenMissingException,
  WsNotConversationMemberException,
  WsInvalidTopicIdException,
  WsInvalidReadReceiptException,
  WsRedisConnectionException,
  WsConversationStateException,
} from "./chat/exceptions/chat.exceptions";

// ---------------------------------------------------------------------------
// messaging/exceptions
// ---------------------------------------------------------------------------
import {
  ConversationNotFoundException as MsgConversationNotFoundException,
  ConversationAlreadyExistsException,
  NotConversationMemberException,
  NotConversationAdminException,
  InvalidParticipantsException,
  ConversationCreationFailedException,
  ParticipantNotFoundException,
  GroupNameRequiredException,
  CannotAddToDirectConversationException,
  AlreadyMemberException,
  MissingEncryptionKeyException,
} from "./messaging/exceptions/conversation.exceptions";

import {
  MessageNotFoundException,
  NotConversationParticipantException as MsgNotConversationParticipantException,
  ConversationTopicNotFoundException,
  EncryptionKeyNotFoundException,
  MessageEncryptionException,
  MessageSubmissionException,
  MessageSyncException,
  InvalidPaginationCursorException,
  InvalidMessageLimitException,
  MediaUploadNotImplementedException,
  MessageTextTooLongException,
} from "./messaging/exceptions/message.exceptions";

// ---------------------------------------------------------------------------
// social/exceptions
// ---------------------------------------------------------------------------
import {
  PostNotFoundException,
  UserNotFoundException as SocialUserNotFoundException,
  UserMissingFeedTopicException,
  PostCreationFailedException,
  IpfsNotConfiguredException as SocialIpfsNotConfiguredException,
  IpfsUploadFailedException as SocialIpfsUploadFailedException,
  FeedRetrievalFailedException,
  MirrorNodeSyncFailedException,
  SocialGraphQueryException,
} from "./social/exceptions/social.exceptions";

import {
  SelfFollowException,
  SelfUnfollowException,
  AlreadyFollowingException,
  NotFollowingException,
  FollowTargetNotFoundException,
  FollowActorNotFoundException,
  FollowHcsSubmissionException,
  UnfollowHcsSubmissionException,
  FollowIndexingException,
  SocialGraphTopicNotConfiguredException,
  SocialGraphSyncException,
} from "./social/exceptions/social-graph.exceptions";

// ---------------------------------------------------------------------------
// identity/exceptions
// ---------------------------------------------------------------------------
import {
  WalletCreationException,
  WalletAlreadyExistsException,
  UserNotFoundException as WalletUserNotFoundException,
  AccountNotFoundException,
} from "./identity/exceptions/wallet-creation.exception";

import {
  KycSubmissionException,
  KycInvalidStateException,
  KycCallbackInvalidException,
  DidNftMintException,
  TopicCreationException,
  OnboardingException,
  KycRecordNotFoundException,
} from "./identity/exceptions/kyc.exception";

import {
  ProfileNotFoundException,
  ProfileUpdateNotAllowedException,
  InvalidSearchQueryException,
  DidNftRefreshException,
  AvatarUploadException,
} from "./identity/exceptions/profile.exception";

import {
  CustodyApiException,
  CustodyNotConfiguredException,
  KeyGenerationException,
  TransactionSigningException,
} from "./identity/exceptions/custody-api.exception";

// ---------------------------------------------------------------------------
// notifications/exceptions
// ---------------------------------------------------------------------------
import {
  NotificationCreateException,
  NotificationQueryException,
  NotificationMarkReadException,
  NotificationUnreadCountException,
  NotificationNotFoundException,
  NotificationHcsException,
  NotificationWebSocketException,
  InvalidMarkReadRequestException,
} from "./notifications/exceptions/notification.exceptions";

// ---------------------------------------------------------------------------
// organization/exceptions (organization.exceptions.ts — NestJS built-in bases)
// ---------------------------------------------------------------------------
import {
  OrganizationNotFoundException,
  OrganizationMemberNotFoundException,
  InvitationNotFoundException,
  OrgPermissionDeniedException,
  CannotRemoveOwnerException,
  CannotModifyOwnRoleException,
  NotOrgMemberException,
  InvitationExpiredException,
  InvitationAlreadyAcceptedException,
  InvalidOrgRoleException,
  UserAlreadyMemberException,
  OrgAlreadyExistsForUserException,
  OrgCreationException,
  OrgHcsSubmissionException,
} from "./organization/exceptions/organization.exceptions";

// ---------------------------------------------------------------------------
// organization/exceptions (organization.exception.ts — BaseException-style with static factories)
// ---------------------------------------------------------------------------
import { OrganizationException } from "./organization/exceptions/organization.exception";

// ---------------------------------------------------------------------------
// payments/exceptions
// ---------------------------------------------------------------------------
import {
  PaymentNotFoundException,
  PaymentRequestNotFoundException,
  TransactionNotFoundException,
  ConversationNotFoundException as PayConversationNotFoundException,
  UserNotFoundException as PayUserNotFoundException,
  NotConversationParticipantException as PayNotConversationParticipantException,
  PaymentRequestNotOwnedException,
  CannotPayOwnRequestException,
  InvalidPaymentAmountException,
  InvalidCurrencyException,
  SelfPaymentException,
  PaymentRequestExpiredException,
  PaymentRequestAlreadyPaidException,
  PaymentRequestAlreadyDeclinedException,
  PaymentRequestNotActionableException,
  InvalidSplitParticipantsException,
  InvalidPaginationException,
  MissingWalletException,
  PaymentExecutionException,
  PaymentEncryptionException,
  HcsSubmissionException,
  BalanceQueryException,
} from "./payments/exceptions/payment.exceptions";

// ---------------------------------------------------------------------------
// integrations/ipfs/exceptions
// ---------------------------------------------------------------------------
import {
  IpfsNotConfiguredException,
  IpfsUploadFailedException,
  IpfsFetchException,
} from "./integrations/ipfs/ipfs.exceptions";

// ---------------------------------------------------------------------------
// integrations/mirsad-ai/exceptions
// ---------------------------------------------------------------------------
import {
  MirsadNotConfiguredException,
  MirsadDisabledException,
  MirsadOnboardingFailedException,
  MirsadTransactionScoringFailedException,
  MirsadValidationException,
  MirsadNotImplementedException,
} from "./integrations/mirsad-ai/mirsad-ai.exceptions";

// ---------------------------------------------------------------------------
// integrations/tamam-custody/exceptions
// ---------------------------------------------------------------------------
import {
  TamamCustodyNotConfiguredException,
  TamamCustodyApiException,
  TamamCustodyNetworkException,
  TamamCustodyInvalidResponseException,
  TamamCustodySigningException,
  TamamCustodyKeypairException,
} from "./integrations/tamam-custody/tamam-custody.exceptions";

// ===========================================================================
// Tests
// ===========================================================================

describe("Exception Coverage — every exception constructor across all modules", () => {
  // -------------------------------------------------------------------------
  // common/exceptions
  // -------------------------------------------------------------------------
  describe("BaseException", () => {
    it("instantiates with code, message, statusCode", () => {
      const ex = new BaseException("TEST_CODE", "test message", 400);
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TEST_CODE");
      expect(ex.getStatus()).toBe(400);
      const response = ex.getResponse() as Record<string, unknown>;
      expect(response.message).toBe("test message");
    });
  });

  // -------------------------------------------------------------------------
  // hedera/exceptions
  // -------------------------------------------------------------------------
  describe("Hedera exceptions", () => {
    it("HederaClientNotInitializedException", () => {
      const ex = new HederaClientNotInitializedException("Client not ready");
      expect(ex).toBeInstanceOf(Error);
      expect(ex).toBeInstanceOf(BaseException);
      expect(ex.code).toBe("HEDERA_CLIENT_NOT_INITIALIZED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("Client not ready");
    });

    it("HederaTopicCreationException", () => {
      const ex = new HederaTopicCreationException("topic create failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("HEDERA_TOPIC_CREATION_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("topic create failed");
    });

    it("HederaMessageSubmissionException", () => {
      const ex = new HederaMessageSubmissionException("submit error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("HEDERA_MESSAGE_SUBMISSION_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("submit error");
    });

    it("HederaTransactionException", () => {
      const ex = new HederaTransactionException("tx failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("HEDERA_TRANSACTION_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("tx failed");
    });

    it("HederaNftMintException", () => {
      const ex = new HederaNftMintException("mint error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("HEDERA_NFT_MINT_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("mint error");
    });

    it("HederaTransferException", () => {
      const ex = new HederaTransferException("transfer error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("HEDERA_TRANSFER_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("transfer error");
    });

    it("MirrorNodeRequestException", () => {
      const ex = new MirrorNodeRequestException("mirror failure");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("MIRROR_NODE_REQUEST_FAILED");
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("mirror failure");
    });
  });

  // -------------------------------------------------------------------------
  // chat/exceptions
  // -------------------------------------------------------------------------
  describe("Chat (WebSocket) exceptions", () => {
    it("WsAuthenticationFailedException", () => {
      const ex = new WsAuthenticationFailedException("bad token");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(401);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("WS_AUTHENTICATION_FAILED");
      expect(resp.message).toContain("bad token");
    });

    it("WsTokenMissingException", () => {
      const ex = new WsTokenMissingException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(401);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("WS_TOKEN_MISSING");
      expect(resp.message).toContain("JWT token");
    });

    it("WsNotConversationMemberException", () => {
      const ex = new WsNotConversationMemberException("0.0.123", "0.0.456");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("WS_NOT_CONVERSATION_MEMBER");
      expect(resp.message).toContain("0.0.123");
      expect(resp.message).toContain("0.0.456");
    });

    it("WsInvalidTopicIdException", () => {
      const ex = new WsInvalidTopicIdException("bad-topic");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("WS_INVALID_TOPIC_ID");
      expect(resp.message).toContain("bad-topic");
    });

    it("WsInvalidReadReceiptException", () => {
      const ex = new WsInvalidReadReceiptException("missing sequence");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("WS_INVALID_READ_RECEIPT");
      expect(resp.message).toContain("missing sequence");
    });

    it("WsRedisConnectionException", () => {
      const ex = new WsRedisConnectionException("ECONNREFUSED");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("WS_REDIS_CONNECTION_FAILED");
      expect(resp.message).toContain("ECONNREFUSED");
    });

    it("WsConversationStateException", () => {
      const ex = new WsConversationStateException("0.0.789", "DB error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("WS_CONVERSATION_STATE_ERROR");
      expect(resp.message).toContain("0.0.789");
      expect(resp.message).toContain("DB error");
    });
  });

  // -------------------------------------------------------------------------
  // messaging/exceptions — conversation
  // -------------------------------------------------------------------------
  describe("Messaging conversation exceptions", () => {
    it("ConversationNotFoundException", () => {
      const ex = new MsgConversationNotFoundException("conv-001");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CONVERSATION_NOT_FOUND");
      expect(resp.message).toContain("conv-001");
    });

    it("ConversationAlreadyExistsException", () => {
      const ex = new ConversationAlreadyExistsException("0.0.1", "0.0.2");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(409);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("DIRECT_CONVERSATION_EXISTS");
      expect(resp.message).toContain("0.0.1");
      expect(resp.message).toContain("0.0.2");
    });

    it("NotConversationMemberException", () => {
      const ex = new NotConversationMemberException("0.0.10", "conv-002");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("NOT_CONVERSATION_MEMBER");
      expect(resp.message).toContain("0.0.10");
      expect(resp.message).toContain("conv-002");
    });

    it("NotConversationAdminException", () => {
      const ex = new NotConversationAdminException("0.0.11", "conv-003");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("NOT_CONVERSATION_ADMIN");
      expect(resp.message).toContain("0.0.11");
      expect(resp.message).toContain("conv-003");
    });

    it("InvalidParticipantsException", () => {
      const ex = new InvalidParticipantsException("must have at least 2");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_PARTICIPANTS");
      expect(resp.message).toContain("must have at least 2");
    });

    it("ConversationCreationFailedException", () => {
      const ex = new ConversationCreationFailedException("HCS down");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CONVERSATION_CREATION_FAILED");
      expect(resp.message).toContain("HCS down");
    });

    it("ParticipantNotFoundException", () => {
      const ex = new ParticipantNotFoundException("0.0.99");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PARTICIPANT_NOT_FOUND");
      expect(resp.message).toContain("0.0.99");
    });

    it("GroupNameRequiredException", () => {
      const ex = new GroupNameRequiredException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("GROUP_NAME_REQUIRED");
      expect(resp.message).toContain("Group name is required");
    });

    it("CannotAddToDirectConversationException", () => {
      const ex = new CannotAddToDirectConversationException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CANNOT_ADD_TO_DIRECT");
      expect(resp.message).toContain("Cannot add participants");
    });

    it("AlreadyMemberException", () => {
      const ex = new AlreadyMemberException("0.0.55");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(409);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ALREADY_MEMBER");
      expect(resp.message).toContain("0.0.55");
    });

    it("MissingEncryptionKeyException", () => {
      const ex = new MissingEncryptionKeyException("0.0.77");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MISSING_ENCRYPTION_KEY");
      expect(resp.message).toContain("0.0.77");
    });
  });

  // -------------------------------------------------------------------------
  // messaging/exceptions — message
  // -------------------------------------------------------------------------
  describe("Messaging message exceptions", () => {
    it("MessageNotFoundException", () => {
      const ex = new MessageNotFoundException("0.0.100", 42);
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MESSAGE_NOT_FOUND");
      expect(resp.message).toContain("42");
      expect(resp.message).toContain("0.0.100");
    });

    it("NotConversationParticipantException (messaging)", () => {
      const ex = new MsgNotConversationParticipantException(
        "0.0.20",
        "0.0.300",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("NOT_CONVERSATION_PARTICIPANT");
      expect(resp.message).toContain("0.0.20");
      expect(resp.message).toContain("0.0.300");
    });

    it("ConversationTopicNotFoundException", () => {
      const ex = new ConversationTopicNotFoundException("0.0.400");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CONVERSATION_TOPIC_NOT_FOUND");
      expect(resp.message).toContain("0.0.400");
    });

    it("EncryptionKeyNotFoundException", () => {
      const ex = new EncryptionKeyNotFoundException("0.0.25", "0.0.500");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ENCRYPTION_KEY_NOT_FOUND");
      expect(resp.message).toContain("0.0.25");
      expect(resp.message).toContain("0.0.500");
    });

    it("MessageEncryptionException", () => {
      const ex = new MessageEncryptionException("AES error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MESSAGE_ENCRYPTION_FAILED");
      expect(resp.message).toContain("AES error");
    });

    it("MessageSubmissionException", () => {
      const ex = new MessageSubmissionException("0.0.600", "timeout");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MESSAGE_SUBMISSION_FAILED");
      expect(resp.message).toContain("0.0.600");
      expect(resp.message).toContain("timeout");
    });

    it("MessageSyncException", () => {
      const ex = new MessageSyncException("0.0.700", "network down");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MESSAGE_SYNC_FAILED");
      expect(resp.message).toContain("0.0.700");
      expect(resp.message).toContain("network down");
    });

    it("InvalidPaginationCursorException", () => {
      const ex = new InvalidPaginationCursorException("abc");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_PAGINATION_CURSOR");
      expect(resp.message).toContain("abc");
    });

    it("InvalidMessageLimitException", () => {
      const ex = new InvalidMessageLimitException("999");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_MESSAGE_LIMIT");
      expect(resp.message).toContain("999");
    });

    it("MediaUploadNotImplementedException", () => {
      const ex = new MediaUploadNotImplementedException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(501);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MEDIA_UPLOAD_NOT_IMPLEMENTED");
      expect(resp.message).toContain("not yet implemented");
    });

    it("MessageTextTooLongException", () => {
      const ex = new MessageTextTooLongException(5000, 4096);
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MESSAGE_TEXT_TOO_LONG");
      expect(resp.message).toContain("5000");
      expect(resp.message).toContain("4096");
    });
  });

  // -------------------------------------------------------------------------
  // social/exceptions — social.exceptions.ts
  // -------------------------------------------------------------------------
  describe("Social exceptions (social.exceptions.ts)", () => {
    it("PostNotFoundException", () => {
      const ex = new PostNotFoundException("post-abc");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("POST_NOT_FOUND");
      expect(resp.message).toContain("post-abc");
    });

    it("UserNotFoundException (social)", () => {
      const ex = new SocialUserNotFoundException("0.0.42");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("USER_NOT_FOUND");
      expect(resp.message).toContain("0.0.42");
    });

    it("UserMissingFeedTopicException", () => {
      const ex = new UserMissingFeedTopicException("0.0.43");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("USER_MISSING_FEED_TOPIC");
      expect(resp.message).toContain("0.0.43");
    });

    it("PostCreationFailedException", () => {
      const ex = new PostCreationFailedException("HCS error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("POST_CREATION_FAILED");
      expect(resp.message).toContain("HCS error");
    });

    it("IpfsNotConfiguredException (social)", () => {
      const ex = new SocialIpfsNotConfiguredException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(503);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("IPFS_NOT_CONFIGURED");
    });

    it("IpfsUploadFailedException (social)", () => {
      const ex = new SocialIpfsUploadFailedException("network timeout");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("IPFS_UPLOAD_FAILED");
      expect(resp.message).toContain("network timeout");
    });

    it("FeedRetrievalFailedException", () => {
      const ex = new FeedRetrievalFailedException("db connection lost");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("FEED_RETRIEVAL_FAILED");
      expect(resp.message).toContain("db connection lost");
    });

    it("MirrorNodeSyncFailedException", () => {
      const ex = new MirrorNodeSyncFailedException("0.0.900", "rate limit");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("MIRROR_NODE_SYNC_FAILED");
      expect(resp.message).toContain("0.0.900");
      expect(resp.message).toContain("rate limit");
    });

    it("SocialGraphQueryException", () => {
      const ex = new SocialGraphQueryException("getFollowers", "timeout");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("SOCIAL_GRAPH_QUERY_FAILED");
      expect(resp.message).toContain("getFollowers");
      expect(resp.message).toContain("timeout");
    });
  });

  // -------------------------------------------------------------------------
  // social/exceptions — social-graph.exceptions.ts
  // -------------------------------------------------------------------------
  describe("Social graph exceptions", () => {
    it("SelfFollowException", () => {
      const ex = new SelfFollowException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex).toBeInstanceOf(BaseException);
      expect(ex.code).toBe("SELF_FOLLOW_NOT_ALLOWED");
      expect(ex.getStatus()).toBe(400);
    });

    it("SelfUnfollowException", () => {
      const ex = new SelfUnfollowException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("SELF_UNFOLLOW_NOT_ALLOWED");
      expect(ex.getStatus()).toBe(400);
    });

    it("AlreadyFollowingException", () => {
      const ex = new AlreadyFollowingException("0.0.1", "0.0.2");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("ALREADY_FOLLOWING");
      expect(ex.getStatus()).toBe(409);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("0.0.1");
      expect(resp.message).toContain("0.0.2");
    });

    it("NotFollowingException", () => {
      const ex = new NotFollowingException("0.0.3", "0.0.4");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("NOT_FOLLOWING");
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("0.0.3");
      expect(resp.message).toContain("0.0.4");
    });

    it("FollowTargetNotFoundException", () => {
      const ex = new FollowTargetNotFoundException("0.0.5");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("FOLLOW_TARGET_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("0.0.5");
    });

    it("FollowActorNotFoundException", () => {
      const ex = new FollowActorNotFoundException("0.0.6");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("FOLLOW_ACTOR_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("0.0.6");
    });

    it("FollowHcsSubmissionException", () => {
      const ex = new FollowHcsSubmissionException("consensus timeout");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("FOLLOW_HCS_SUBMISSION_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("consensus timeout");
    });

    it("UnfollowHcsSubmissionException", () => {
      const ex = new UnfollowHcsSubmissionException("network error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("UNFOLLOW_HCS_SUBMISSION_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("network error");
    });

    it("FollowIndexingException", () => {
      const ex = new FollowIndexingException("unique constraint violation");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("FOLLOW_INDEXING_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("unique constraint violation");
    });

    it("SocialGraphTopicNotConfiguredException", () => {
      const ex = new SocialGraphTopicNotConfiguredException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("SOCIAL_GRAPH_TOPIC_NOT_CONFIGURED");
      expect(ex.getStatus()).toBe(503);
    });

    it("SocialGraphSyncException", () => {
      const ex = new SocialGraphSyncException("mirror node 503");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("SOCIAL_GRAPH_SYNC_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("mirror node 503");
    });
  });

  // -------------------------------------------------------------------------
  // identity/exceptions — wallet-creation
  // -------------------------------------------------------------------------
  describe("Identity wallet-creation exceptions", () => {
    it("WalletCreationException with default code", () => {
      const ex = new WalletCreationException("key gen failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("WALLET_CREATION_FAILED");
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "key gen failed",
      );
    });

    it("WalletCreationException with custom code", () => {
      const ex = new WalletCreationException(
        "custom reason",
        "WALLET_CUSTOM_ERROR",
      );
      expect(ex.code).toBe("WALLET_CUSTOM_ERROR");
    });

    it("WalletAlreadyExistsException", () => {
      const ex = new WalletAlreadyExistsException("user-1", "0.0.123");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("WALLET_ALREADY_EXISTS");
      expect(ex.getStatus()).toBe(409);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "user-1",
      );
      expect((resp.error as Record<string, unknown>).message).toContain(
        "0.0.123",
      );
    });

    it("UserNotFoundException (wallet)", () => {
      const ex = new WalletUserNotFoundException("user-404");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("USER_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "user-404",
      );
    });

    it("AccountNotFoundException", () => {
      const ex = new AccountNotFoundException("0.0.999");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("ACCOUNT_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "0.0.999",
      );
    });
  });

  // -------------------------------------------------------------------------
  // identity/exceptions — kyc
  // -------------------------------------------------------------------------
  describe("Identity KYC exceptions", () => {
    it("KycSubmissionException with default code", () => {
      const ex = new KycSubmissionException("API down");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("KYC_SUBMISSION_FAILED");
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "API down",
      );
    });

    it("KycSubmissionException with custom code", () => {
      const ex = new KycSubmissionException("custom", "KYC_CUSTOM");
      expect(ex.code).toBe("KYC_CUSTOM");
    });

    it("KycInvalidStateException", () => {
      const ex = new KycInvalidStateException(
        "user-x",
        "pending_wallet",
        "wallet_created",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("KYC_INVALID_STATE");
      expect(ex.getStatus()).toBe(409);
      const resp = ex.getResponse() as Record<string, unknown>;
      const msg = (resp.error as Record<string, unknown>).message as string;
      expect(msg).toContain("user-x");
      expect(msg).toContain("pending_wallet");
      expect(msg).toContain("wallet_created");
    });

    it("KycCallbackInvalidException", () => {
      const ex = new KycCallbackInvalidException("req-abc");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("KYC_CALLBACK_INVALID");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "req-abc",
      );
    });

    it("DidNftMintException with default code", () => {
      const ex = new DidNftMintException("mint failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("DID_NFT_MINT_FAILED");
      expect(ex.getStatus()).toBe(500);
    });

    it("DidNftMintException with custom code", () => {
      const ex = new DidNftMintException("custom mint", "DID_CUSTOM");
      expect(ex.code).toBe("DID_CUSTOM");
    });

    it("TopicCreationException with default code", () => {
      const ex = new TopicCreationException("topic error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TOPIC_CREATION_FAILED");
      expect(ex.getStatus()).toBe(500);
    });

    it("TopicCreationException with custom code", () => {
      const ex = new TopicCreationException("custom topic", "TOPIC_CUSTOM");
      expect(ex.code).toBe("TOPIC_CUSTOM");
    });

    it("OnboardingException with defaults", () => {
      const ex = new OnboardingException("onboard fail");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("ONBOARDING_FAILED");
      expect(ex.getStatus()).toBe(500);
    });

    it("OnboardingException with custom code and status", () => {
      const ex = new OnboardingException("conflict", "ONBOARD_CONFLICT", 409);
      expect(ex.code).toBe("ONBOARD_CONFLICT");
      expect(ex.getStatus()).toBe(409);
    });

    it("KycRecordNotFoundException", () => {
      const ex = new KycRecordNotFoundException("user-z");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("KYC_RECORD_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "user-z",
      );
    });
  });

  // -------------------------------------------------------------------------
  // identity/exceptions — profile
  // -------------------------------------------------------------------------
  describe("Identity profile exceptions", () => {
    it("ProfileNotFoundException", () => {
      const ex = new ProfileNotFoundException("0.0.111");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("PROFILE_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "0.0.111",
      );
    });

    it("ProfileUpdateNotAllowedException", () => {
      const ex = new ProfileUpdateNotAllowedException(
        "user-abc",
        "pending_kyc",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("PROFILE_UPDATE_NOT_ALLOWED");
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      const msg = (resp.error as Record<string, unknown>).message as string;
      expect(msg).toContain("pending_kyc");
      expect(msg).toContain("user-abc");
    });

    it("InvalidSearchQueryException", () => {
      const ex = new InvalidSearchQueryException("query too short");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("INVALID_SEARCH_QUERY");
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "query too short",
      );
    });

    it("DidNftRefreshException with default code", () => {
      const ex = new DidNftRefreshException("wipe failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("DID_NFT_REFRESH_FAILED");
      expect(ex.getStatus()).toBe(500);
    });

    it("DidNftRefreshException with custom code", () => {
      const ex = new DidNftRefreshException("custom", "REFRESH_CUSTOM");
      expect(ex.code).toBe("REFRESH_CUSTOM");
    });

    it("AvatarUploadException with default code", () => {
      const ex = new AvatarUploadException("pinata error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("AVATAR_UPLOAD_FAILED");
      expect(ex.getStatus()).toBe(502);
    });

    it("AvatarUploadException with custom code", () => {
      const ex = new AvatarUploadException("custom", "AVATAR_CUSTOM");
      expect(ex.code).toBe("AVATAR_CUSTOM");
    });
  });

  // -------------------------------------------------------------------------
  // identity/exceptions — custody-api
  // -------------------------------------------------------------------------
  describe("Identity custody-api exceptions", () => {
    it("CustodyApiException with defaults", () => {
      const ex = new CustodyApiException("api error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("CUSTODY_API_ERROR");
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "api error",
      );
    });

    it("CustodyApiException with custom code and status", () => {
      const ex = new CustodyApiException("custom", "CUSTODY_CUSTOM", 503);
      expect(ex.code).toBe("CUSTODY_CUSTOM");
      expect(ex.getStatus()).toBe(503);
    });

    it("CustodyNotConfiguredException", () => {
      const ex = new CustodyNotConfiguredException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("CUSTODY_NOT_CONFIGURED");
      expect(ex.getStatus()).toBe(503);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "Tamam Custody API not configured",
      );
    });

    it("KeyGenerationException", () => {
      const ex = new KeyGenerationException("random bytes failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("KEY_GENERATION_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "random bytes failed",
      );
    });

    it("TransactionSigningException", () => {
      const ex = new TransactionSigningException("MPC error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TRANSACTION_SIGNING_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect((resp.error as Record<string, unknown>).message).toContain(
        "MPC error",
      );
    });
  });

  // -------------------------------------------------------------------------
  // notifications/exceptions
  // -------------------------------------------------------------------------
  describe("Notification exceptions", () => {
    it("NotificationCreateException", () => {
      const ex = new NotificationCreateException("db write failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex).toBeInstanceOf(BaseException);
      expect(ex.code).toBe("NOTIFICATION_CREATE_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("db write failed");
    });

    it("NotificationQueryException", () => {
      const ex = new NotificationQueryException(
        "fetch notifications",
        "connection timeout",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("NOTIFICATION_QUERY_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("fetch notifications");
      expect(resp.message).toContain("connection timeout");
    });

    it("NotificationMarkReadException", () => {
      const ex = new NotificationMarkReadException("update failed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("NOTIFICATION_MARK_READ_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("update failed");
    });

    it("NotificationUnreadCountException", () => {
      const ex = new NotificationUnreadCountException("count query error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("NOTIFICATION_UNREAD_COUNT_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("count query error");
    });

    it("NotificationNotFoundException", () => {
      const ex = new NotificationNotFoundException("notif-xyz");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("NOTIFICATION_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("notif-xyz");
    });

    it("NotificationHcsException", () => {
      const ex = new NotificationHcsException("HCS unreachable");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("NOTIFICATION_HCS_SUBMISSION_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("HCS unreachable");
    });

    it("NotificationWebSocketException", () => {
      const ex = new NotificationWebSocketException("socket closed");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("NOTIFICATION_WEBSOCKET_EMIT_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("socket closed");
    });

    it("InvalidMarkReadRequestException", () => {
      const ex = new InvalidMarkReadRequestException("empty ID list");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("INVALID_MARK_READ_REQUEST");
      expect(ex.getStatus()).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // organization/exceptions — organization.exceptions.ts (NestJS built-in bases)
  // -------------------------------------------------------------------------
  describe("Organization exceptions (organization.exceptions.ts)", () => {
    it("OrganizationNotFoundException", () => {
      const ex = new OrganizationNotFoundException("org-001");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ORGANIZATION_NOT_FOUND");
      expect(resp.message).toContain("org-001");
    });

    it("OrganizationMemberNotFoundException", () => {
      const ex = new OrganizationMemberNotFoundException("org-002", "user-x");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ORGANIZATION_MEMBER_NOT_FOUND");
      expect(resp.message).toContain("org-002");
      expect(resp.message).toContain("user-x");
    });

    it("InvitationNotFoundException", () => {
      const ex = new InvitationNotFoundException("tok-abc");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVITATION_NOT_FOUND");
      expect(resp.message).toContain("tok-abc");
    });

    it("OrgPermissionDeniedException", () => {
      const ex = new OrgPermissionDeniedException("admin", "member");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ORG_PERMISSION_DENIED");
      expect(resp.message).toContain("admin");
      expect(resp.message).toContain("member");
    });

    it("CannotRemoveOwnerException", () => {
      const ex = new CannotRemoveOwnerException("org-003");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CANNOT_REMOVE_OWNER");
      expect(resp.message).toContain("org-003");
    });

    it("CannotModifyOwnRoleException", () => {
      const ex = new CannotModifyOwnRoleException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CANNOT_MODIFY_OWN_ROLE");
      expect(resp.message).toContain("Cannot modify your own role");
    });

    it("NotOrgMemberException", () => {
      const ex = new NotOrgMemberException("user-y", "org-004");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("NOT_ORG_MEMBER");
      expect(resp.message).toContain("user-y");
      expect(resp.message).toContain("org-004");
    });

    it("InvitationExpiredException", () => {
      const ex = new InvitationExpiredException("tok-def");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVITATION_EXPIRED");
      expect(resp.message).toContain("tok-def");
    });

    it("InvitationAlreadyAcceptedException", () => {
      const ex = new InvitationAlreadyAcceptedException("tok-ghi");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVITATION_ALREADY_ACCEPTED");
      expect(resp.message).toContain("tok-ghi");
    });

    it("InvalidOrgRoleException", () => {
      const ex = new InvalidOrgRoleException("superadmin");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_ORG_ROLE");
      expect(resp.message).toContain("superadmin");
    });

    it("UserAlreadyMemberException", () => {
      const ex = new UserAlreadyMemberException("user-z", "org-005");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(409);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("USER_ALREADY_MEMBER");
      expect(resp.message).toContain("user-z");
      expect(resp.message).toContain("org-005");
    });

    it("OrgAlreadyExistsForUserException", () => {
      const ex = new OrgAlreadyExistsForUserException("user-w");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(409);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ORG_ALREADY_EXISTS");
      expect(resp.message).toContain("user-w");
    });

    it("OrgCreationException", () => {
      const ex = new OrgCreationException("DB constraint violated");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ORG_CREATION_FAILED");
      expect(resp.message).toContain("DB constraint violated");
    });

    it("OrgHcsSubmissionException", () => {
      const ex = new OrgHcsSubmissionException("0.0.800", "timeout");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("ORG_HCS_SUBMISSION_FAILED");
      expect(resp.message).toContain("0.0.800");
      expect(resp.message).toContain("timeout");
    });
  });

  // -------------------------------------------------------------------------
  // organization/exceptions — organization.exception.ts (static factories)
  // -------------------------------------------------------------------------
  describe("OrganizationException (static factories)", () => {
    it("constructor", () => {
      const ex = new OrganizationException("CUSTOM", "custom msg", 422);
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("CUSTOM");
      expect(ex.getStatus()).toBe(422);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toBe("custom msg");
    });

    it("OrganizationException.notFound()", () => {
      const ex = OrganizationException.notFound("org-xyz");
      expect(ex).toBeInstanceOf(Error);
      expect(ex).toBeInstanceOf(OrganizationException);
      expect(ex.code).toBe("ORG_NOT_FOUND");
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("org-xyz");
    });

    it("OrganizationException.kybNotApproved()", () => {
      const ex = OrganizationException.kybNotApproved("org-kyb");
      expect(ex).toBeInstanceOf(OrganizationException);
      expect(ex.code).toBe("ORG_KYB_NOT_APPROVED");
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("org-kyb");
    });

    it("OrganizationException.permissionDenied()", () => {
      const ex = OrganizationException.permissionDenied();
      expect(ex).toBeInstanceOf(OrganizationException);
      expect(ex.code).toBe("ORG_PERMISSION_DENIED");
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("permission");
    });
  });

  // -------------------------------------------------------------------------
  // payments/exceptions
  // -------------------------------------------------------------------------
  describe("Payment exceptions", () => {
    it("PaymentNotFoundException", () => {
      const ex = new PaymentNotFoundException("pay-001");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_NOT_FOUND");
      expect(resp.message).toContain("pay-001");
    });

    it("PaymentRequestNotFoundException", () => {
      const ex = new PaymentRequestNotFoundException("req-001");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_REQUEST_NOT_FOUND");
      expect(resp.message).toContain("req-001");
    });

    it("TransactionNotFoundException", () => {
      const ex = new TransactionNotFoundException("tx-001");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("TRANSACTION_NOT_FOUND");
      expect(resp.message).toContain("tx-001");
    });

    it("ConversationNotFoundException (payments)", () => {
      const ex = new PayConversationNotFoundException("0.0.888");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CONVERSATION_NOT_FOUND");
      expect(resp.message).toContain("0.0.888");
    });

    it("UserNotFoundException (payments)", () => {
      const ex = new PayUserNotFoundException("user-pay");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(404);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("USER_NOT_FOUND");
      expect(resp.message).toContain("user-pay");
    });

    it("NotConversationParticipantException (payments)", () => {
      const ex = new PayNotConversationParticipantException(
        "0.0.50",
        "0.0.600",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("NOT_CONVERSATION_PARTICIPANT");
      expect(resp.message).toContain("0.0.50");
      expect(resp.message).toContain("0.0.600");
    });

    it("PaymentRequestNotOwnedException", () => {
      const ex = new PaymentRequestNotOwnedException("req-002", "0.0.55");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_REQUEST_NOT_OWNED");
      expect(resp.message).toContain("req-002");
      expect(resp.message).toContain("0.0.55");
    });

    it("CannotPayOwnRequestException", () => {
      const ex = new CannotPayOwnRequestException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(403);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("CANNOT_PAY_OWN_REQUEST");
      expect(resp.message).toContain("Cannot fulfill your own");
    });

    it("InvalidPaymentAmountException", () => {
      const ex = new InvalidPaymentAmountException(-5, "must be positive");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_PAYMENT_AMOUNT");
      expect(resp.message).toContain("-5");
      expect(resp.message).toContain("must be positive");
    });

    it("InvalidCurrencyException", () => {
      const ex = new InvalidCurrencyException("BTC");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_CURRENCY");
      expect(resp.message).toContain("BTC");
    });

    it("SelfPaymentException", () => {
      const ex = new SelfPaymentException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("SELF_PAYMENT_NOT_ALLOWED");
      expect(resp.message).toContain("Cannot send a payment to yourself");
    });

    it("PaymentRequestExpiredException", () => {
      const ex = new PaymentRequestExpiredException("req-exp");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_REQUEST_EXPIRED");
      expect(resp.message).toContain("req-exp");
    });

    it("PaymentRequestAlreadyPaidException", () => {
      const ex = new PaymentRequestAlreadyPaidException("req-paid");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_REQUEST_ALREADY_PAID");
      expect(resp.message).toContain("req-paid");
    });

    it("PaymentRequestAlreadyDeclinedException", () => {
      const ex = new PaymentRequestAlreadyDeclinedException("req-dec");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_REQUEST_ALREADY_DECLINED");
      expect(resp.message).toContain("req-dec");
    });

    it("PaymentRequestNotActionableException", () => {
      const ex = new PaymentRequestNotActionableException(
        "req-na",
        "cancelled",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_REQUEST_NOT_ACTIONABLE");
      expect(resp.message).toContain("req-na");
      expect(resp.message).toContain("cancelled");
    });

    it("InvalidSplitParticipantsException", () => {
      const ex = new InvalidSplitParticipantsException("duplicate accounts");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_SPLIT_PARTICIPANTS");
      expect(resp.message).toContain("duplicate accounts");
    });

    it("InvalidPaginationException", () => {
      const ex = new InvalidPaginationException("offset must be >= 0");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("INVALID_PAGINATION");
      expect(resp.message).toContain("offset must be >= 0");
    });

    it("MissingWalletException", () => {
      const ex = new MissingWalletException("user-nw");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("MISSING_WALLET");
      expect(resp.message).toContain("user-nw");
    });

    it("PaymentExecutionException", () => {
      const ex = new PaymentExecutionException("insufficient funds");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_EXECUTION_FAILED");
      expect(resp.message).toContain("insufficient funds");
    });

    it("PaymentEncryptionException", () => {
      const ex = new PaymentEncryptionException("key mismatch");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("PAYMENT_ENCRYPTION_FAILED");
      expect(resp.message).toContain("key mismatch");
    });

    it("HcsSubmissionException", () => {
      const ex = new HcsSubmissionException("0.0.999", "topic archived");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("HCS_SUBMISSION_FAILED");
      expect(resp.message).toContain("0.0.999");
      expect(resp.message).toContain("topic archived");
    });

    it("BalanceQueryException", () => {
      const ex = new BalanceQueryException("0.0.777", "mirror node 503");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.code).toBe("BALANCE_QUERY_FAILED");
      expect(resp.message).toContain("0.0.777");
      expect(resp.message).toContain("mirror node 503");
    });
  });

  // -------------------------------------------------------------------------
  // integrations/ipfs exceptions
  // -------------------------------------------------------------------------
  describe("IPFS integration exceptions", () => {
    it("IpfsNotConfiguredException", () => {
      const ex = new IpfsNotConfiguredException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(503);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("IPFS_NOT_CONFIGURED");
    });

    it("IpfsUploadFailedException", () => {
      const ex = new IpfsUploadFailedException("pinata 500");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("IPFS_UPLOAD_FAILED");
      expect(resp.message).toContain("pinata 500");
    });

    it("IpfsFetchException", () => {
      const ex = new IpfsFetchException("QmABC123", 404, "Not Found");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("IPFS_FETCH_FAILED");
      expect(resp.message).toContain("QmABC123");
      expect(resp.message).toContain("404");
      expect(resp.message).toContain("Not Found");
    });
  });

  // -------------------------------------------------------------------------
  // integrations/mirsad-ai exceptions
  // -------------------------------------------------------------------------
  describe("Mirsad AI integration exceptions", () => {
    it("MirsadNotConfiguredException", () => {
      const ex = new MirsadNotConfiguredException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(503);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("MIRSAD_NOT_CONFIGURED");
    });

    it("MirsadDisabledException", () => {
      const ex = new MirsadDisabledException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(503);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("MIRSAD_DISABLED");
    });

    it("MirsadOnboardingFailedException", () => {
      const ex = new MirsadOnboardingFailedException("service down");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("MIRSAD_ONBOARDING_FAILED");
      expect(resp.message).toContain("service down");
    });

    it("MirsadTransactionScoringFailedException", () => {
      const ex = new MirsadTransactionScoringFailedException("rate limited");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("MIRSAD_TRANSACTION_SCORING_FAILED");
      expect(resp.message).toContain("rate limited");
    });

    it("MirsadValidationException", () => {
      const ex = new MirsadValidationException("full_name", "is required");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(400);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("MIRSAD_VALIDATION_ERROR");
      expect(resp.message).toContain("full_name");
      expect(resp.message).toContain("is required");
    });

    it("MirsadNotImplementedException", () => {
      const ex = new MirsadNotImplementedException(
        "statusPolling",
        "callback only",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.getStatus()).toBe(501);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.error).toBe("MIRSAD_NOT_IMPLEMENTED");
      expect(resp.message).toContain("statusPolling");
      expect(resp.message).toContain("callback only");
    });
  });

  // -------------------------------------------------------------------------
  // integrations/tamam-custody exceptions
  // -------------------------------------------------------------------------
  describe("Tamam Custody integration exceptions", () => {
    it("TamamCustodyNotConfiguredException", () => {
      const ex = new TamamCustodyNotConfiguredException();
      expect(ex).toBeInstanceOf(Error);
      expect(ex).toBeInstanceOf(BaseException);
      expect(ex.code).toBe("TAMAM_CUSTODY_NOT_CONFIGURED");
      expect(ex.getStatus()).toBe(503);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("Tamam Custody API credentials");
    });

    it("TamamCustodyApiException — maps 401 to 502", () => {
      const ex = new TamamCustodyApiException(
        "generateKey",
        401,
        "AUTH_FAILED",
        "invalid API key",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TAMAM_CUSTODY_API_ERROR");
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("generateKey");
      expect(resp.message).toContain("401");
      expect(resp.message).toContain("AUTH_FAILED");
      expect(resp.message).toContain("invalid API key");
    });

    it("TamamCustodyApiException — maps 429 to 429", () => {
      const ex = new TamamCustodyApiException(
        "signTransaction",
        429,
        "RATE_LIMIT",
        "too many requests",
      );
      expect(ex.getStatus()).toBe(429);
    });

    it("TamamCustodyApiException — maps 500+ to 502", () => {
      const ex = new TamamCustodyApiException(
        "signTransaction",
        503,
        "SERVICE_UNAVAILABLE",
        "server down",
      );
      expect(ex.getStatus()).toBe(502);
    });

    it("TamamCustodyApiException — maps other codes to 500", () => {
      const ex = new TamamCustodyApiException(
        "signTransaction",
        400,
        "BAD_REQUEST",
        "invalid body",
      );
      expect(ex.getStatus()).toBe(500);
    });

    it("TamamCustodyNetworkException", () => {
      const ex = new TamamCustodyNetworkException(
        "generateKey",
        "ECONNREFUSED",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TAMAM_CUSTODY_NETWORK_ERROR");
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("generateKey");
      expect(resp.message).toContain("ECONNREFUSED");
    });

    it("TamamCustodyInvalidResponseException", () => {
      const ex = new TamamCustodyInvalidResponseException(
        "getKeyStatus",
        "missing publicKey field",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TAMAM_CUSTODY_INVALID_RESPONSE");
      expect(ex.getStatus()).toBe(502);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("getKeyStatus");
      expect(resp.message).toContain("missing publicKey field");
    });

    it("TamamCustodySigningException", () => {
      const ex = new TamamCustodySigningException(
        "ks-12345",
        "threshold not met",
      );
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TAMAM_CUSTODY_SIGNING_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("ks-12345");
      expect(resp.message).toContain("threshold not met");
    });

    it("TamamCustodyKeypairException", () => {
      const ex = new TamamCustodyKeypairException("entropy error");
      expect(ex).toBeInstanceOf(Error);
      expect(ex.code).toBe("TAMAM_CUSTODY_KEYPAIR_FAILED");
      expect(ex.getStatus()).toBe(500);
      const resp = ex.getResponse() as Record<string, unknown>;
      expect(resp.message).toContain("entropy error");
    });
  });
});
