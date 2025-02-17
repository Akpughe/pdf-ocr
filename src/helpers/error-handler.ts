import { Request, Response, NextFunction } from "express";
import { ValidationError } from "express-validation"; // Import your validation library if it's different from the built-in Error
import CustomError from "./custom-error";

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof ValidationError) {
    // Handle validation errors
    return res.status(err.statusCode).json(err);
  } else if (err instanceof CustomError) {
    // Handle custom errors created using CustomError
    return res.status(err.statusCode()).json({ message: err.message });
  } else {
    // Handle other types of errors
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
