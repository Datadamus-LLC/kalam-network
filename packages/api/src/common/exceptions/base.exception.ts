import { HttpException } from "@nestjs/common";

export class BaseException extends HttpException {
  public readonly code: string;

  constructor(code: string, message: string, statusCode: number) {
    super({ code, message }, statusCode);
    this.code = code;
  }
}
