import {
  IsString,
  IsOptional,
  IsInt,
  MaxLength,
  MinLength,
  Min,
} from "class-validator";
import { MESSAGE_CONSTANTS } from "../constants/message.constants";

/**
 * DTO for sending a message to a conversation.
 *
 * POST /api/v1/conversations/:topicId/messages
 */
export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MESSAGE_CONSTANTS.MAX_TEXT_LENGTH)
  text!: string;

  /**
   * Client-side AES-256-GCM encrypted content (JSON: {ciphertext, iv, tag}).
   * When provided, stored server-side and returned to recipients for decryption.
   * Server NEVER decrypts this — it's end-to-end encrypted.
   */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  encryptedContent?: string;

  @IsOptional()
  @IsString()
  mediaRef?: string; // IPFS CID for media attachments

  @IsOptional()
  @IsInt()
  @Min(1)
  replyToSequence?: number;
}
