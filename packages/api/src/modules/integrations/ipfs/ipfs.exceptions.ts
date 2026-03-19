import { HttpException, HttpStatus } from "@nestjs/common";

export class IpfsNotConfiguredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: "IPFS_NOT_CONFIGURED",
        message: "IPFS (Pinata) credentials are not configured",
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class IpfsUploadFailedException extends HttpException {
  constructor(reason: string) {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: "IPFS_UPLOAD_FAILED",
        message: `IPFS upload failed: ${reason}`,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

export class IpfsFetchException extends HttpException {
  constructor(cid: string, statusCode: number, statusText: string) {
    super(
      {
        statusCode: HttpStatus.BAD_GATEWAY,
        error: "IPFS_FETCH_FAILED",
        message: `IPFS fetch failed for CID ${cid}: ${statusCode} ${statusText}`,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }
}
