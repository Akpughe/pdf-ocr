import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { fileUploadQueue } from "../../app";
import path from "path";

dotenv.config();

export const initUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { pdf_id } = req.body;

  const file = req.file;

  if (!file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  // Construct the file path
  const file_path = path.join(__dirname, "..", "uploads", file.filename);

  try {
    await fileUploadQueue.add("pdf-upload", { file_path, pdf_id });

    res.json({ message: "File upload started in the background" });
  } catch (error) {
    next(error);
  }
};
