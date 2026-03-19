import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { Interval } from "@nestjs/schedule";
import { v4 as uuidv4 } from "uuid";
import sanitizeHtml from "sanitize-html";
import { PaymentIndexEntity } from "../../database/entities/payment-index.entity";
import { PaymentRequestEntity } from "../../database/entities/payment-request.entity";
import { TransactionEntity } from "../../database/entities/transaction.entity";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { HederaService } from "../hedera/hedera.service";
import { MirrorNodeService } from "../hedera/mirror-node.service";
import { TamamCustodyService } from "../integrations/tamam-custody/tamam-custody.service";
import { PAYMENT_CONSTANTS } from "./constants/payment.constants";
import type {
  PaymentResponse,
  PaymentRequestResponse,
  TransactionResponse,
  TransactionDetailResponse,
  PaginatedPaymentHistoryResponse,
  BalanceResponse,
} from "./dto/payment-response.dto";
import {
  PaymentRequestNotFoundException,
  PaymentRequestExpiredException,
  PaymentRequestAlreadyPaidException,
  PaymentRequestAlreadyDeclinedException,
  PaymentRequestAlreadyCancelledException,
  PaymentRequestNotActionableException,
  NotConversationParticipantException,
  CannotPayOwnRequestException,
  InvalidPaymentAmountException,
  InvalidCurrencyException,
  MissingWalletException,
  UserNotFoundException,
  PaymentExecutionException,
  HcsSubmissionException,
  TransactionNotFoundException,
} from "./exceptions/payment.exceptions";
import type { JwtPayload } from "../../common/guards/jwt-auth.guard";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentRequestEntity)
    private readonly paymentRequestRepo: Repository<PaymentRequestEntity>,
    @InjectRepository(PaymentIndexEntity)
    private readonly paymentIndexRepo: Repository<PaymentIndexEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(ConversationMemberEntity)
    private readonly memberRepo: Repository<ConversationMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly mirrorNodeService: MirrorNodeService,
    private readonly tamamCustodyService: TamamCustodyService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send a payment to another user via HTS transfer.
   */
  async sendPayment(
    user: JwtPayload,
    recipientAccountId: string,
    amount: number,
    currency: string,
    topicId?: string,
    note?: string,
  ): Promise<PaymentResponse> {
    this.validateCurrency(currency);
    this.validateAmount(amount);

    // Sanitize note to prevent stored XSS
    const sanitizedNote = note
      ? sanitizeHtml(note, { allowedTags: [], allowedAttributes: {} }).trim()
      : undefined;

    if (user.hederaAccountId === recipientAccountId) {
      throw new InvalidPaymentAmountException(
        amount,
        "Cannot send to yourself",
      );
    }

    const recipient = await this.userRepo.findOne({
      where: { hederaAccountId: recipientAccountId },
    });
    if (!recipient) {
      throw new UserNotFoundException(recipientAccountId);
    }

    // Only verify conversation membership if a topicId is provided
    if (topicId) {
      await this.verifyConversationMembership(user.hederaAccountId, topicId);
    }

    let hederaTxId: string | null = null;
    try {
      hederaTxId = await this.executeCustodyTransfer(
        user.sub,
        user.hederaAccountId,
        recipientAccountId,
        amount,
        currency,
      );
      this.logger.log(
        `${currency} transfer completed: ${hederaTxId} (${amount} ${currency} from ${user.hederaAccountId} to ${recipientAccountId})`,
      );
    } catch (error: unknown) {
      if (error instanceof PaymentExecutionException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new PaymentExecutionException(message);
    }

    // Submit payment receipt to HCS (only if topicId provided)
    let hcsSequenceNumber: number | null = null;
    if (topicId) try {
      const hcsPayload = {
        v: PAYMENT_CONSTANTS.HCS_PAYLOAD_VERSION,
        type: "payment",
        sender: user.hederaAccountId,
        content: {
          action: "send",
          amount,
          currency,
          recipient: recipientAccountId,
          txId: hederaTxId,
          note: sanitizedNote ?? null,
        },
      };
      const seqStr = await this.hederaService.submitMessage(
        topicId,
        Buffer.from(JSON.stringify(hcsPayload)),
      );
      hcsSequenceNumber = parseInt(seqStr, 10);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `HCS receipt submission failed (non-blocking): ${message}`,
      );
    }

    // Index the payment
    const paymentId = uuidv4();
    const paymentIndex = new PaymentIndexEntity();
    paymentIndex.id = paymentId;
    paymentIndex.senderAccountId = user.hederaAccountId;
    paymentIndex.recipientAccountId = recipientAccountId;
    paymentIndex.amount = amount;
    paymentIndex.currency = currency;
    paymentIndex.htsTransactionId = hederaTxId ?? "";
    paymentIndex.hcsTopicId = topicId ?? "";
    paymentIndex.hcsSequenceNumber = hcsSequenceNumber ?? 0;
    paymentIndex.paymentType = "send";
    paymentIndex.tamamReference = "";
    paymentIndex.status = "confirmed";
    const saved = await this.paymentIndexRepo.save(paymentIndex);

    // Record dual transaction records (T32)
    await this.recordTransaction({
      senderUserId: user.sub,
      senderAccountId: user.hederaAccountId,
      recipientUserId: recipient.id,
      recipientAccountId,
      amount,
      currency,
      hederaTxId,
      hcsMessageSeq: hcsSequenceNumber,
      tamamTxRef: null,
      conversationId: null,
      paymentRequestId: null,
      paymentType: "send",
      description: sanitizedNote ?? null,
      organizationId: null,
    });

    return {
      id: paymentId,
      senderAccountId: user.hederaAccountId,
      recipientAccountId,
      amount,
      currency,
      paymentType: "send",
      status: "confirmed",
      hederaTxId,
      hcsTopicId: topicId ?? null,
      hcsSequenceNumber,
      tamamReference: null,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  /**
   * Create a payment request in a conversation.
   */
  async createPaymentRequest(
    user: JwtPayload,
    topicId: string | undefined,
    amount: number,
    currency: string,
    description?: string,
    customExpiresAt?: string,
  ): Promise<PaymentRequestResponse> {
    this.validateCurrency(currency);
    this.validateAmount(amount);

    // Sanitize description to prevent stored XSS
    const sanitizedDescription = description
      ? sanitizeHtml(description, {
          allowedTags: [],
          allowedAttributes: {},
        }).trim()
      : undefined;

    if (topicId) {
      await this.verifyConversationMembership(user.hederaAccountId, topicId);
    }

    const requestId = uuidv4();
    const expiresAt = customExpiresAt
      ? new Date(customExpiresAt)
      : new Date(
          Date.now() +
            PAYMENT_CONSTANTS.DEFAULT_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000,
        );

    // Submit payment request to HCS (only if topicId provided)
    let hcsSequenceNumber: number | null = null;
    if (topicId) try {
      const hcsPayload = {
        v: PAYMENT_CONSTANTS.HCS_PAYLOAD_VERSION,
        type: "payment_request",
        sender: user.hederaAccountId,
        content: {
          action: "request",
          amount,
          currency,
          note: sanitizedDescription ?? null,
          requestId,
          status: "pending",
          expiresAt: expiresAt.toISOString(),
          paidTxHash: null,
        },
      };
      const seqStr = await this.hederaService.submitMessage(
        topicId,
        Buffer.from(JSON.stringify(hcsPayload)),
      );
      hcsSequenceNumber = parseInt(seqStr, 10);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HcsSubmissionException(topicId ?? "", message);
    }

    // Find the conversation for this topic
    const member = await this.memberRepo
      .createQueryBuilder("m")
      .innerJoinAndSelect("m.conversation", "c")
      .where("m.hederaAccountId = :hederaAccountId", {
        hederaAccountId: user.hederaAccountId,
      })
      .andWhere("c.hcsTopicId = :topicId", { topicId })
      .getOne();

    const paymentRequest = new PaymentRequestEntity();
    paymentRequest.id = requestId;
    paymentRequest.requesterUserId = user.sub;
    paymentRequest.hcsTopicId = topicId ?? "";
    paymentRequest.hcsSequenceNumber = hcsSequenceNumber ?? 0;
    paymentRequest.amount = amount;
    paymentRequest.currency = currency;
    paymentRequest.status = "pending";
    paymentRequest.expiresAt = expiresAt;
    if (member?.conversationId) {
      paymentRequest.conversationId = member.conversationId;
    }
    if (sanitizedDescription) {
      paymentRequest.description = sanitizedDescription;
    }
    await this.paymentRequestRepo.save(paymentRequest);

    this.logger.log(
      `Payment request created: ${requestId} for ${amount} ${currency} in topic ${topicId}`,
    );

    return this.toPaymentRequestResponse(paymentRequest);
  }

  /**
   * Fulfill (pay) a payment request.
   */
  async fulfillPaymentRequest(
    user: JwtPayload,
    requestId: string,
    topicId?: string,
  ): Promise<PaymentRequestResponse> {
    const request = await this.findPaymentRequestOrFail(requestId);

    if (request.requesterUserId === user.sub) {
      throw new CannotPayOwnRequestException();
    }

    if (request.status === "paid") {
      throw new PaymentRequestAlreadyPaidException(requestId);
    }

    if (request.status === "declined") {
      throw new PaymentRequestAlreadyDeclinedException(requestId);
    }

    if (request.status === "expired" || new Date() > request.expiresAt) {
      request.status = "expired";
      await this.paymentRequestRepo.save(request);
      throw new PaymentRequestExpiredException(requestId);
    }

    // Find the requester's Hedera account
    const requester = await this.userRepo.findOne({
      where: { id: request.requesterUserId },
    });
    if (!requester?.hederaAccountId) {
      throw new MissingWalletException(request.requesterUserId);
    }

    // Execute the transfer via MPC custody signing
    let hederaTxId: string;
    try {
      hederaTxId = await this.executeCustodyTransfer(
        user.sub,
        user.hederaAccountId,
        requester.hederaAccountId,
        Number(request.amount),
        request.currency,
      );
    } catch (error: unknown) {
      if (error instanceof PaymentExecutionException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new PaymentExecutionException(message);
    }

    // Update payment request status
    request.status = "paid";
    request.paidTxId = hederaTxId;
    request.paidAt = new Date();
    await this.paymentRequestRepo.save(request);

    // Submit status update to HCS (only if topicId provided)
    if (topicId) {
      try {
        const hcsPayload = {
          v: PAYMENT_CONSTANTS.HCS_PAYLOAD_VERSION,
          type: "payment_request_update",
          requestId,
          status: "paid",
          paidTxId: hederaTxId,
          paidAt: request.paidAt.toISOString(),
          updatedBy: user.hederaAccountId,
        };
        await this.hederaService.submitMessage(
          topicId,
          Buffer.from(JSON.stringify(hcsPayload)),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`HCS status update failed (non-blocking): ${message}`);
      }
    }

    // Index the payment
    const paymentId = uuidv4();
    const fulfillIndex = new PaymentIndexEntity();
    fulfillIndex.id = paymentId;
    fulfillIndex.senderAccountId = user.hederaAccountId;
    fulfillIndex.recipientAccountId = requester.hederaAccountId;
    fulfillIndex.amount = Number(request.amount);
    fulfillIndex.currency = request.currency;
    fulfillIndex.htsTransactionId = hederaTxId;
    fulfillIndex.hcsTopicId = topicId ?? "";
    fulfillIndex.hcsSequenceNumber = 0;
    fulfillIndex.paymentType = "request_fulfillment";
    fulfillIndex.tamamReference = "";
    fulfillIndex.status = "confirmed";
    await this.paymentIndexRepo.save(fulfillIndex);

    // Record dual transaction records (T32)
    await this.recordTransaction({
      senderUserId: user.sub,
      senderAccountId: user.hederaAccountId,
      recipientUserId: requester.id,
      recipientAccountId: requester.hederaAccountId,
      amount: Number(request.amount),
      currency: request.currency,
      hederaTxId,
      hcsMessageSeq: null,
      tamamTxRef: null,
      conversationId: request.conversationId ?? null,
      paymentRequestId: requestId,
      paymentType: "request_fulfillment",
      description: request.description ?? null,
      organizationId: request.organizationId ?? null,
    });

    this.logger.log(
      `Payment request ${requestId} fulfilled with tx ${hederaTxId}`,
    );

    return this.toPaymentRequestResponse(request);
  }

  /**
   * Decline a payment request.
   */
  async declinePaymentRequest(
    user: JwtPayload,
    requestId: string,
    reason?: string,
  ): Promise<PaymentRequestResponse> {
    const request = await this.findPaymentRequestOrFail(requestId);

    // Only non-requester participants can decline
    if (request.requesterUserId === user.sub) {
      throw new PaymentRequestNotActionableException(requestId, "own_request");
    }

    if (request.status !== "pending") {
      if (request.status === "declined") {
        throw new PaymentRequestAlreadyDeclinedException(requestId);
      }
      throw new PaymentRequestNotActionableException(requestId, request.status);
    }

    request.status = "declined";
    await this.paymentRequestRepo.save(request);

    // Submit decline to HCS
    try {
      const hcsPayload = {
        v: PAYMENT_CONSTANTS.HCS_PAYLOAD_VERSION,
        type: "payment_request_update",
        requestId,
        status: "declined",
        reason: reason ?? null,
        updatedBy: user.hederaAccountId,
      };
      await this.hederaService.submitMessage(
        request.hcsTopicId,
        Buffer.from(JSON.stringify(hcsPayload)),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`HCS decline update failed (non-blocking): ${message}`);
    }

    this.logger.log(`Payment request ${requestId} declined by ${user.sub}`);
    return this.toPaymentRequestResponse(request);
  }

  /**
   * Cancel a payment request. Only the original requester can cancel.
   * Can only cancel if status is 'pending'.
   */
  async cancelPaymentRequest(
    user: JwtPayload,
    requestId: string,
  ): Promise<PaymentRequestResponse> {
    const request = await this.findPaymentRequestOrFail(requestId);

    // Only the requester (creator) can cancel
    if (request.requesterUserId !== user.sub) {
      throw new PaymentRequestNotActionableException(
        requestId,
        "not_requester",
      );
    }

    if (request.status !== "pending") {
      if (request.status === "cancelled") {
        throw new PaymentRequestAlreadyCancelledException(requestId);
      }
      throw new PaymentRequestNotActionableException(requestId, request.status);
    }

    request.status = "cancelled";
    await this.paymentRequestRepo.save(request);

    // Submit cancellation to HCS
    try {
      const hcsPayload = {
        v: PAYMENT_CONSTANTS.HCS_PAYLOAD_VERSION,
        type: "payment_request_update",
        requestId,
        status: "cancelled",
        updatedBy: user.hederaAccountId,
      };
      await this.hederaService.submitMessage(
        request.hcsTopicId,
        Buffer.from(JSON.stringify(hcsPayload)),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`HCS cancel update failed (non-blocking): ${message}`);
    }

    this.logger.log(`Payment request ${requestId} cancelled by ${user.sub}`);
    return this.toPaymentRequestResponse(request);
  }

  /**
   * Create a split payment — sends individual payment requests to each participant.
   *
   * Flow:
   * 1. Validate inputs (currency, total amount, participants)
   * 2. Calculate per-participant amounts (equal or custom split)
   * 3. Create individual payment requests for each participant
   * 4. Submit split event to HCS for audit trail
   *
   * @returns Split payment summary with all created request IDs
   */
  async createSplitPayment(
    user: JwtPayload,
    dto: {
      totalAmount: number;
      currency: string;
      splitMethod: "equal" | "custom";
      participantAccountIds: string[];
      topicId?: string;
      note?: string;
      customAmounts?: Record<string, number>;
    },
  ): Promise<{
    requestIds: string[];
    topicId: string | null;
    totalAmount: number;
    currency: string;
    splitMethod: "equal" | "custom";
    participantCount: number;
    hcsSequenceNumber: string | null;
  }> {
    this.validateCurrency(dto.currency);
    this.validateAmount(dto.totalAmount);
    if (dto.topicId) {
      await this.verifyConversationMembership(user.hederaAccountId, dto.topicId);
    }

    const participantCount = dto.participantAccountIds.length;

    // Calculate per-participant amounts
    const amounts: Record<string, number> = {};
    if (dto.splitMethod === "equal") {
      const perPerson =
        Math.round((dto.totalAmount / participantCount) * 100) / 100;
      for (const accountId of dto.participantAccountIds) {
        amounts[accountId] = perPerson;
      }
    } else {
      if (!dto.customAmounts) {
        throw new InvalidPaymentAmountException(
          0,
          "customAmounts required for custom split method",
        );
      }
      for (const accountId of dto.participantAccountIds) {
        const amt = dto.customAmounts[accountId];
        if (amt === undefined || amt <= 0) {
          throw new InvalidPaymentAmountException(
            amt ?? 0,
            `Missing or invalid amount for participant ${accountId}`,
          );
        }
        amounts[accountId] = amt;
      }
    }

    // Create payment requests for each participant
    const requestIds: string[] = [];
    for (const accountId of dto.participantAccountIds) {
      const result = await this.createPaymentRequest(
        user,
        dto.topicId,
        amounts[accountId],
        dto.currency,
        dto.note,
      );
      requestIds.push(result.id);
    }

    // Submit split event to HCS (non-blocking, only if topicId provided)
    let hcsSequenceNumber: string | null = null;
    if (dto.topicId) try {
      const hcsPayload = {
        v: PAYMENT_CONSTANTS.HCS_PAYLOAD_VERSION,
        type: "split_payment",
        sender: user.hederaAccountId,
        content: {
          totalAmount: dto.totalAmount,
          currency: dto.currency,
          splitMethod: dto.splitMethod,
          participantCount,
          requestIds,
          note: dto.note ?? null,
        },
      };
      hcsSequenceNumber = await this.hederaService.submitMessage(
        dto.topicId,
        Buffer.from(JSON.stringify(hcsPayload)),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `HCS split payment event failed (non-blocking): ${message}`,
      );
    }

    this.logger.log(
      `Split payment created: ${requestIds.length} requests, total ${dto.totalAmount} ${dto.currency}`,
    );

    return {
      requestIds,
      topicId: dto.topicId ?? null,
      totalAmount: dto.totalAmount,
      currency: dto.currency,
      splitMethod: dto.splitMethod,
      participantCount,
      hcsSequenceNumber,
    };
  }

  /**
   * Get a single payment request by ID.
   */
  async getPaymentRequest(requestId: string): Promise<PaymentRequestResponse> {
    const request = await this.findPaymentRequestOrFail(requestId);
    await this.autoExpire(request);
    return this.toPaymentRequestResponse(request);
  }

  /**
   * List payment requests with optional filters.
   */
  async getPaymentRequests(
    conversationId?: string,
    status?: string,
    limit: number = PAYMENT_CONSTANTS.DEFAULT_PAGE_SIZE,
    cursor?: string,
  ): Promise<{
    requests: PaymentRequestResponse[];
    cursor: string | null;
    hasMore: boolean;
  }> {
    const pageSize = Math.min(limit, PAYMENT_CONSTANTS.MAX_PAGE_SIZE);

    const qb = this.paymentRequestRepo
      .createQueryBuilder("pr")
      .orderBy("pr.createdAt", "DESC")
      .take(pageSize + 1);

    if (conversationId) {
      qb.andWhere("pr.conversationId = :conversationId", { conversationId });
    }

    if (status) {
      qb.andWhere("pr.status = :status", { status });
    }

    if (cursor) {
      qb.andWhere("pr.createdAt < :cursor", { cursor: new Date(cursor) });
    }

    const results = await qb.getMany();
    const hasMore = results.length > pageSize;
    const page = hasMore ? results.slice(0, pageSize) : results;

    // Auto-expire pending requests that have passed their expiry
    for (const req of page) {
      await this.autoExpire(req);
    }

    const nextCursor =
      page.length > 0 ? page[page.length - 1]!.createdAt.toISOString() : null;

    return {
      requests: page.map((r) => this.toPaymentRequestResponse(r)),
      cursor: hasMore ? nextCursor : null,
      hasMore,
    };
  }

  /**
   * Get account balance via Mirror Node.
   */
  async getBalance(hederaAccountId: string): Promise<BalanceResponse> {
    if (!hederaAccountId) {
      throw new MissingWalletException("current user");
    }

    const [accountInfo, tmUsdSmallestUnits] = await Promise.all([
      this.mirrorNodeService.getAccountInfo(hederaAccountId),
      this.mirrorNodeService.getTokenBalance(
        hederaAccountId,
        PAYMENT_CONSTANTS.TOKEN_ADDRESSES.TMUSD,
      ),
    ]);

    // Mirror Node returns balance in tinybars; convert to HBAR (1 HBAR = 100_000_000 tinybar)
    const hbarBalance = accountInfo.balance.balance / 100_000_000;
    // TMUSD has 2 decimals — smallest units ÷ 100
    const tmUsdBalance =
      tmUsdSmallestUnits / Math.pow(10, PAYMENT_CONSTANTS.TOKEN_DECIMALS.TMUSD);

    return {
      accountId: hederaAccountId,
      hbarBalance,
      tmUsdBalance,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get paginated payment history for a user.
   */
  async getPaymentHistory(
    hederaAccountId: string,
    limit: number = PAYMENT_CONSTANTS.DEFAULT_PAGE_SIZE,
    cursor?: string,
  ): Promise<PaginatedPaymentHistoryResponse> {
    const pageSize = Math.min(limit, PAYMENT_CONSTANTS.MAX_PAGE_SIZE);

    const qb = this.paymentIndexRepo
      .createQueryBuilder("p")
      .where(
        "(p.senderAccountId = :accountId OR p.recipientAccountId = :accountId)",
        { accountId: hederaAccountId },
      )
      .orderBy("p.createdAt", "DESC")
      .take(pageSize + 1);

    if (cursor) {
      qb.andWhere("p.createdAt < :cursor", { cursor: new Date(cursor) });
    }

    const results = await qb.getMany();
    const hasMore = results.length > pageSize;
    const page = hasMore ? results.slice(0, pageSize) : results;

    // Batch-fetch counterparty names by Hedera account ID
    const counterpartyAccountIds = [...new Set(page.map((p) =>
      p.senderAccountId === hederaAccountId ? p.recipientAccountId : p.senderAccountId,
    ))];
    const counterpartyUsers2 = counterpartyAccountIds.length > 0
      ? await this.userRepo.find({ where: { hederaAccountId: In(counterpartyAccountIds) }, select: ["hederaAccountId", "displayName"] })
      : [];
    const counterpartyAccountMap = new Map(counterpartyUsers2.map((u) => [u.hederaAccountId, u.displayName]));

    const transactions: TransactionResponse[] = page.map((p) => {
      const cpAccountId = p.senderAccountId === hederaAccountId ? p.recipientAccountId : p.senderAccountId;
      return {
        id: p.id,
        direction: p.senderAccountId === hederaAccountId ? "sent" : "received",
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status === "confirmed" ? "completed" : "failed",
        description: null,
        counterpartyId: cpAccountId,
        counterpartyName: counterpartyAccountMap.get(cpAccountId) ?? null,
        hederaTxId: p.htsTransactionId,
        paymentType: p.paymentType,
        createdAt: p.createdAt.toISOString(),
        completedAt: p.createdAt.toISOString(),
      };
    });

    const nextCursor =
      page.length > 0 ? page[page.length - 1]!.createdAt.toISOString() : null;

    return {
      transactions,
      cursor: hasMore ? nextCursor : null,
      hasMore,
    };
  }

  // ─── T32: Transaction Query & Detail ─────────────────────────────────────

  /**
   * Query transactions with rich filtering (T32).
   */
  async queryTransactions(
    userId: string,
    options: {
      direction?: "sent" | "received" | "all";
      status?: "completed" | "pending" | "failed";
      from?: string;
      to?: string;
      search?: string;
      organizationId?: string;
      limit?: number;
      cursor?: string;
    } = {},
  ): Promise<PaginatedPaymentHistoryResponse> {
    const pageSize = Math.min(
      options.limit ?? PAYMENT_CONSTANTS.DEFAULT_PAGE_SIZE,
      PAYMENT_CONSTANTS.MAX_PAGE_SIZE,
    );

    const qb = this.transactionRepo
      .createQueryBuilder("t")
      .orderBy("t.createdAt", "DESC")
      .take(pageSize + 1);

    // Org context or personal
    if (options.organizationId) {
      qb.andWhere("t.organizationId = :orgId", {
        orgId: options.organizationId,
      });
    } else {
      qb.andWhere("t.userId = :userId", { userId });
    }

    // Direction filter
    if (options.direction && options.direction !== "all") {
      qb.andWhere("t.direction = :direction", {
        direction: options.direction,
      });
    }

    // Status filter
    if (options.status) {
      qb.andWhere("t.status = :status", { status: options.status });
    }

    // Date range
    if (options.from) {
      qb.andWhere("t.createdAt >= :from", { from: new Date(options.from) });
    }
    if (options.to) {
      qb.andWhere("t.createdAt <= :to", { to: new Date(options.to) });
    }

    // Search: counterparty name or Hedera tx ID
    if (options.search) {
      qb.andWhere(
        "(t.hederaTxId ILIKE :search OR t.counterpartyId IN " +
          '(SELECT u.id FROM users u WHERE u."displayName" ILIKE :searchWild))',
        {
          search: `%${options.search}%`,
          searchWild: `%${options.search}%`,
        },
      );
    }

    // Cursor pagination
    if (options.cursor) {
      qb.andWhere("t.createdAt < :cursor", {
        cursor: new Date(options.cursor),
      });
    }

    const results = await qb.getMany();
    const hasMore = results.length > pageSize;
    const page = hasMore ? results.slice(0, pageSize) : results;

    // Batch-fetch counterparty display names
    const counterpartyIds = [...new Set(page.map((t) => t.counterpartyId))];
    const counterpartyUsers = counterpartyIds.length > 0
      ? await this.userRepo.find({ where: { id: In(counterpartyIds) }, select: ["id", "displayName", "hederaAccountId"] })
      : [];
    const counterpartyMap = new Map(counterpartyUsers.map((u) => [u.id, u.displayName ?? u.hederaAccountId]));

    const transactions: TransactionResponse[] = page.map((t) =>
      this.toTransactionResponse(t, counterpartyMap.get(t.counterpartyId)),
    );

    const nextCursor =
      page.length > 0 ? page[page.length - 1]!.createdAt.toISOString() : null;

    return {
      transactions,
      cursor: hasMore ? nextCursor : null,
      hasMore,
    };
  }

  /**
   * Get a single transaction with full detail and on-chain proof links (T32).
   */
  async getTransactionDetail(
    transactionId: string,
    userId: string,
  ): Promise<TransactionDetailResponse> {
    const tx = await this.transactionRepo.findOne({
      where: { id: transactionId, userId },
    });
    if (!tx) {
      throw new TransactionNotFoundException(transactionId);
    }

    // Fetch counterparty profile
    const counterpartyUser = await this.userRepo.findOne({
      where: { id: tx.counterpartyId },
    });

    const networkName = this.configService.get<string>(
      "hedera.network",
      "testnet",
    );
    const hashscanBase = this.configService.get<string>("hashscan.baseUrl", "");

    const hcsExplorerUrl = tx.hcsMessageSeq
      ? `${hashscanBase}/${networkName}/topic/${tx.conversationId}/message/${tx.hcsMessageSeq}`
      : null;

    const htsExplorerUrl = tx.hederaTxId
      ? `${hashscanBase}/${networkName}/transaction/${tx.hederaTxId}`
      : null;

    return {
      ...this.toTransactionResponse(tx),
      conversationId: tx.conversationId ?? null,
      organizationId: tx.organizationId ?? null,
      paymentRequestId: tx.paymentRequestId ?? null,
      hcsMessageSeq: tx.hcsMessageSeq ? Number(tx.hcsMessageSeq) : null,
      tamamTxRef: tx.tamamTxRef ?? null,
      onChainProof: {
        hcsExplorerUrl,
        htsExplorerUrl,
      },
      counterpartyProfile: counterpartyUser?.hederaAccountId
        ? {
            displayName: counterpartyUser.displayName ?? null,
            avatarUrl: counterpartyUser.avatarUrl ?? null,
            hederaAccountId: counterpartyUser.hederaAccountId,
          }
        : null,
    };
  }

  // ─── Background Job: Auto-Expire Stale Payment Requests ─────────────────

  /**
   * Proactively expire pending payment requests whose expiresAt has passed.
   * Runs every 60 seconds. Updates status from 'pending' to 'expired' in bulk.
   */
  @Interval(60_000)
  async expirePendingRequests(): Promise<void> {
    try {
      const result = await this.paymentRequestRepo
        .createQueryBuilder()
        .update(PaymentRequestEntity)
        .set({ status: "expired" })
        .where("status = :status", { status: "pending" })
        .andWhere("expiresAt < :now", { now: new Date() })
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Auto-expired ${result.affected} pending payment request(s)`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Payment auto-expire job failed: ${message}`);
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Record dual transaction records (sender + receiver) in the transactions table.
   */
  private async recordTransaction(params: {
    senderUserId: string;
    senderAccountId: string;
    recipientUserId: string;
    recipientAccountId: string;
    amount: number;
    currency: string;
    hederaTxId: string | null;
    hcsMessageSeq: number | null;
    tamamTxRef: string | null;
    conversationId: string | null;
    paymentRequestId: string | null;
    paymentType: "send" | "request_fulfillment" | "split_payment";
    description: string | null;
    organizationId: string | null;
  }): Promise<void> {
    const now = new Date();

    // Sender record
    const senderTx = new TransactionEntity();
    senderTx.id = uuidv4();
    senderTx.userId = params.senderUserId;
    senderTx.counterpartyId = params.recipientUserId;
    senderTx.direction = "sent";
    senderTx.amount = params.amount;
    senderTx.currency = params.currency;
    senderTx.status = "completed";
    senderTx.paymentType = params.paymentType;
    senderTx.completedAt = now;
    if (params.hederaTxId) senderTx.hederaTxId = params.hederaTxId;
    if (params.hcsMessageSeq) senderTx.hcsMessageSeq = params.hcsMessageSeq;
    if (params.tamamTxRef) senderTx.tamamTxRef = params.tamamTxRef;
    if (params.conversationId) senderTx.conversationId = params.conversationId;
    if (params.paymentRequestId)
      senderTx.paymentRequestId = params.paymentRequestId;
    if (params.description) senderTx.description = params.description;
    if (params.organizationId) senderTx.organizationId = params.organizationId;

    // Receiver record
    const receiverTx = new TransactionEntity();
    receiverTx.id = uuidv4();
    receiverTx.userId = params.recipientUserId;
    receiverTx.counterpartyId = params.senderUserId;
    receiverTx.direction = "received";
    receiverTx.amount = params.amount;
    receiverTx.currency = params.currency;
    receiverTx.status = "completed";
    receiverTx.paymentType = params.paymentType;
    receiverTx.completedAt = now;
    if (params.hederaTxId) receiverTx.hederaTxId = params.hederaTxId;
    if (params.hcsMessageSeq) receiverTx.hcsMessageSeq = params.hcsMessageSeq;
    if (params.tamamTxRef) receiverTx.tamamTxRef = params.tamamTxRef;
    if (params.conversationId)
      receiverTx.conversationId = params.conversationId;
    if (params.paymentRequestId)
      receiverTx.paymentRequestId = params.paymentRequestId;
    if (params.description) receiverTx.description = params.description;

    await this.transactionRepo.save([senderTx, receiverTx]);
    this.logger.log(
      `Transaction recorded: ${senderTx.id} (sent) + ${receiverTx.id} (received)`,
    );
  }

  private toTransactionResponse(
    tx: TransactionEntity,
    counterpartyName?: string | null,
  ): TransactionResponse {
    return {
      id: tx.id,
      direction: tx.direction,
      amount: Number(tx.amount),
      currency: tx.currency,
      status: tx.status,
      description: tx.description ?? null,
      counterpartyId: tx.counterpartyId,
      counterpartyName: counterpartyName ?? null,
      hederaTxId: tx.hederaTxId ?? null,
      paymentType: tx.paymentType,
      createdAt: tx.createdAt.toISOString(),
      completedAt: tx.completedAt ? tx.completedAt.toISOString() : null,
    };
  }

  private async findPaymentRequestOrFail(
    requestId: string,
  ): Promise<PaymentRequestEntity> {
    const request = await this.paymentRequestRepo.findOne({
      where: { id: requestId },
    });
    if (!request) {
      throw new PaymentRequestNotFoundException(requestId);
    }
    return request;
  }

  /**
   * Execute an HBAR transfer using Tamam Custody MPC signing.
   *
   * Uses the one-step v1 vaults transaction API which creates, signs
   * (via MPC), and broadcasts the transaction in a single call.
   * Uses the custody transactions API (POST /api/custody/transactions) which
   * creates the transaction, runs policy/compliance gates, auto-triggers MPC
   * signing, and broadcasts — all in one flow. We poll for completion.
   *
   * No fallbacks. MPC custody is the only signing path.
   * If custody fails, the error propagates — no silent workarounds.
   */
  private async executeCustodyTransfer(
    senderUserId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    currency: string,
  ): Promise<string> {
    const sender = await this.userRepo
      .createQueryBuilder("user")
      .where("user.id = :id", { id: senderUserId })
      .getOne();

    if (!sender?.keyId) {
      throw new MissingWalletException(
        `User ${senderUserId} has no custody vault (keyId). Cannot sign transaction.`,
      );
    }

    this.logger.log(
      `Using MPC custody signing for ${currency} transfer from ${fromAccountId}`,
    );

    const result = await this.tamamCustodyService.executeTransfer(
      sender.keyId,
      toAccountId,
      String(amount),
      currency,
      `Hedera Social transfer: ${fromAccountId} → ${toAccountId}`,
    );

    return result.txHash;
  }

  private async verifyConversationMembership(
    hederaAccountId: string,
    topicId: string,
  ): Promise<void> {
    const member = await this.memberRepo
      .createQueryBuilder("m")
      .innerJoinAndSelect("m.conversation", "c")
      .where("m.hederaAccountId = :hederaAccountId", { hederaAccountId })
      .andWhere("c.hcsTopicId = :topicId", { topicId })
      .getOne();

    if (!member) {
      throw new NotConversationParticipantException(hederaAccountId, topicId);
    }
  }

  private async autoExpire(request: PaymentRequestEntity): Promise<void> {
    if (request.status === "pending" && new Date() > request.expiresAt) {
      request.status = "expired";
      await this.paymentRequestRepo.save(request);
    }
  }

  private validateCurrency(currency: string): void {
    const supported =
      PAYMENT_CONSTANTS.SUPPORTED_CURRENCIES as readonly string[];
    if (!supported.includes(currency)) {
      throw new InvalidCurrencyException(currency);
    }
  }

  private validateAmount(amount: number): void {
    if (amount < PAYMENT_CONSTANTS.MIN_AMOUNT) {
      throw new InvalidPaymentAmountException(
        amount,
        `Minimum amount is ${PAYMENT_CONSTANTS.MIN_AMOUNT}`,
      );
    }
    if (amount > PAYMENT_CONSTANTS.MAX_AMOUNT) {
      throw new InvalidPaymentAmountException(
        amount,
        `Maximum amount is ${PAYMENT_CONSTANTS.MAX_AMOUNT}`,
      );
    }
  }

  private toPaymentRequestResponse(
    entity: PaymentRequestEntity,
  ): PaymentRequestResponse {
    return {
      id: entity.id,
      requesterUserId: entity.requesterUserId,
      organizationId: entity.organizationId ?? null,
      conversationId: entity.conversationId ?? null,
      hcsTopicId: entity.hcsTopicId,
      hcsSequenceNumber: entity.hcsSequenceNumber
        ? Number(entity.hcsSequenceNumber)
        : null,
      amount: Number(entity.amount),
      currency: entity.currency,
      description: entity.description ?? null,
      status: entity.status,
      paidTxId: entity.paidTxId ?? null,
      paidAt: entity.paidAt ? entity.paidAt.toISOString() : null,
      expiresAt: entity.expiresAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
