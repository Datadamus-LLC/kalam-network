import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  IsNumber,
  IsPositive,
} from "class-validator";
import { Type } from "class-transformer";

export class MediaUploadDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(["image", "video"])
  type!: "image" | "video";

  @IsString()
  @IsNotEmpty()
  ipfsCid!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @IsPositive()
  size!: number;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsString()
  alt?: string;
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(280, { message: 'Post content must not exceed 280 characters' })
  text!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaUploadDto)
  media?: MediaUploadDto[];
}
