import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsEmail,
  IsNumber,
  Matches,
  ValidateNested,
  MaxLength,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Document data for KYC verification.
 * Document refs are URLs (S3, IPFS gateway, etc.) pointing to uploaded documents.
 * Reference: mirsad-ai-integration.md — document_data section
 */
export class KycDocumentDataDto {
  @IsOptional()
  @IsString()
  @IsIn(["passport", "drivers_license", "national_id"])
  documentType?: string;

  @IsOptional()
  @IsString()
  documentFrontRef?: string;

  @IsOptional()
  @IsString()
  documentBackRef?: string;

  @IsOptional()
  @IsString()
  selfieImageRef?: string;
}

/**
 * Compliance declarations for KYC.
 */
export class KycComplianceDataDto {
  @IsOptional()
  @IsString()
  sourceOfFundsDeclaration?: string;

  @IsOptional()
  @IsString()
  sourceOfFundsDetails?: string;
}

/**
 * DTO for individual KYC submission.
 * Maps to Mirsad AI onboarding individual data.
 * Reference: mirsad-ai-integration.md — IndividualData interface
 */
export class IndividualKycSubmitDto {
  @IsIn(["individual"])
  @IsNotEmpty()
  accountType!: "individual";

  /** Full legal name — used for sanction list screening */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullLegalName!: string;

  /** Date of birth in YYYY-MM-DD format */
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "dateOfBirth must be in YYYY-MM-DD format",
  })
  dateOfBirth!: string;

  /** Nationality — ISO 3166-1 alpha-2 country code */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  nationality!: string;

  /** Country of residence — ISO 3166-1 alpha-2 */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  countryOfResidence!: string;

  /**
   * Current residential address — comma-separated:
   * "Street Address, City, Postal Code, Country"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  currentResidentialAddress!: string;

  /** National ID number for identity verification */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nationalIdNumber!: string;

  /** City of birth — for sanction risk screening */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityOfBirth!: string;

  /** Country of birth — for sanction risk screening */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  countryOfBirth!: string;

  // -- Optional identity fields --

  @IsOptional()
  @IsString()
  @IsIn(["M", "F"])
  gender?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  passportNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  // -- Financial fields for high net worth detection (CT-05) --

  @IsOptional()
  @IsNumber()
  declaredIncome?: number;

  @IsOptional()
  @IsNumber()
  netWorth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyInput?: string;

  // -- Nested document data --

  @IsOptional()
  @ValidateNested()
  @Type(() => KycDocumentDataDto)
  documentData?: KycDocumentDataDto;

  // -- Nested compliance data --

  @IsOptional()
  @ValidateNested()
  @Type(() => KycComplianceDataDto)
  complianceData?: KycComplianceDataDto;
}

/**
 * Beneficial owner information for corporate KYC.
 */
export class BeneficialOwnerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fullLegalName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "dateOfBirth must be in YYYY-MM-DD format",
  })
  dateOfBirth!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  nationality!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  countryOfResidence!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  currentResidentialAddress!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nationalIdNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cityOfBirth!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  countryOfBirth!: string;

  @IsOptional()
  @IsString()
  @IsIn(["M", "F"])
  gender?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  passportNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  occupation?: string;
}

/**
 * Corporate compliance data for KYB.
 */
export class CorporateComplianceDataDto {
  @IsOptional()
  @IsString()
  sourceOfFundsDeclaration?: string;

  @IsOptional()
  @IsString()
  sourceOfFundsDetails?: string;

  @IsOptional()
  @IsString({ each: true })
  countriesOfOperation?: string[];

  @IsOptional()
  @IsNumber()
  estimatedAnnualRevenueBhd?: number;
}

/**
 * DTO for corporate KYC (KYB) submission.
 * Maps to Mirsad AI onboarding corporate data.
 * Reference: mirsad-ai-integration.md — CorporateData interface
 */
export class CorporateKycSubmitDto {
  @IsIn(["business"])
  @IsNotEmpty()
  accountType!: "business";

  /** Official business name */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalEntityName!: string;

  /** Where business is registered — ISO 3166-1 alpha-2 */
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(2)
  countryOfIncorporation!: string;

  /** Tax ID, company registration number */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  businessRegistrationNumber!: string;

  /**
   * Business address — comma-separated:
   * "Street Address, City, Postal Code, Country"
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  businessAddress!: string;

  // -- Optional entity fields --

  @IsOptional()
  @IsString()
  @MaxLength(500)
  primaryActivityDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxIdentificationNumber?: string;

  @IsOptional()
  @IsString()
  tradeLicensesRef?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsNumber()
  declaredIncome?: number;

  @IsOptional()
  @IsNumber()
  netWorth?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyInput?: string;

  // -- Beneficial owners --

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => BeneficialOwnerDto)
  beneficialOwners?: BeneficialOwnerDto[];

  // -- Nested document data --

  @IsOptional()
  @ValidateNested()
  @Type(() => KycDocumentDataDto)
  documentData?: KycDocumentDataDto;

  // -- Nested compliance data --

  @IsOptional()
  @ValidateNested()
  @Type(() => CorporateComplianceDataDto)
  complianceData?: CorporateComplianceDataDto;
}

/**
 * Union type for KYC submission — either individual or corporate.
 */
export type KycSubmitDto = IndividualKycSubmitDto | CorporateKycSubmitDto;
