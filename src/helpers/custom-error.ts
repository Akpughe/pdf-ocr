class CustomError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    Error.captureStackTrace(this, this.constructor);

    this.name = this.constructor.name;
    this.status = status;
  }

  statusCode(): number {
    return this.status;
  }

  errorMessage(): string {
    return this.message;
  }
}

export default CustomError;
