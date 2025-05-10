import { Worker } from "bullmq";
import { supabase } from "../config/supabaseClient";
import { redisConnection } from "../config/redis";
import { sanitizeFileName } from "../helpers/santizeFile";
import { readFile, access } from "fs/promises";
import { constants } from "fs";
import path from "path";

// Helper function to validate file existence and accessibility
const validateFile = async (filePath: string): Promise<string> => {
  try {
    // Make sure we're looking in the right place relative to project root
    const projectRoot = path.resolve(__dirname, "..", "..");
    const absolutePath = path.resolve(projectRoot, filePath);

    console.log("Checking file at:", absolutePath);

    // Check if file exists and is accessible
    await access(absolutePath, constants.R_OK);

    return absolutePath;
  } catch (error) {
    throw new Error(
      `File validation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      } (Path: ${filePath})`
    );
  }
};

export const uploadProcess = new Worker(
  "file-upload-queue",
  async (job: { data: any }) => {
    try {
      const { file_path, pdf_id } = job.data;

      // Validate input
      if (typeof file_path !== "string") {
        throw new Error("Invalid file path provided");
      }

      console.log(`Starting upload process for PDF ID: ${pdf_id}`);
      console.log(`Raw file path received: ${file_path}`);

      // Handle path with or without leading 'uploads/'
      const normalizedPath = file_path.includes("uploads/")
        ? file_path
        : path.join("uploads", path.basename(file_path));

      // Validate and get absolute file path
      const absolutePath = await validateFile(normalizedPath);
      console.log(`File validated. Reading from: ${absolutePath}`);

      // Read file from filesystem
      const fileBuffer = await readFile(absolutePath);

      // Get the original filename from the path
      const originalFileName = path.basename(absolutePath);

      // Generate a unique file path for Supabase
      const timestamp = new Date().getTime();
      const sanitizedFileName = sanitizeFileName(originalFileName);
      const uploadPath = `${timestamp}_${sanitizedFileName}`;

      console.log(`Uploading file to Supabase with path: ${uploadPath}`);

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("pdf_files")
        .upload(uploadPath, fileBuffer, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      if (!uploadData) {
        throw new Error("Upload completed but no data returned");
      }

      // Get public URL
      const { data: publicURL } = supabase.storage
        .from("pdf_files")
        .getPublicUrl(uploadData.path);

      if (!publicURL?.publicUrl) {
        throw new Error("Failed to generate public URL");
      }

      // Update PDF metadata in database
      const { error: pdfError } = await supabase
        .from("pdfs")
        .update({
          file_path: publicURL.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pdf_id);

      if (pdfError) {
        throw new Error(`Database update failed: ${pdfError.message}`);
      }

      console.log(`File uploaded successfully for PDF ID: ${pdf_id}`);

      return {
        success: true,
        publicUrl: publicURL.publicUrl,
        pdfId: pdf_id,
        originalPath: absolutePath,
      };
    } catch (error) {
      console.error("Upload process failed:", error);
      // Add more context to the error
      const enhancedError = new Error(
        `Upload failed for file: ${job.data.file_path}. Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      throw enhancedError;
    }
  },
  {
    connection: redisConnection,
    prefix: "pdf-upload",
    concurrency: 1,
    autorun: true,
  }
);

// Worker status logging
uploadProcess.on("ready", () => {
  console.log("🟢 PDF Upload Worker is ready");
});

uploadProcess.on("active", (job) => {
  console.log(`📝 PDF Upload Worker processing job ${job.id}`);
});

uploadProcess.on("completed", (job) => {
  console.log(`✅ PDF Upload Worker completed job ${job.id}`);
});

uploadProcess.on("failed", (job, error) => {
  console.error(`❌ PDF Upload Worker failed job ${job?.id}:`, error);
});

uploadProcess.on("error", (error: Error) => {
  console.error("⚠️ PDF Upload Worker error:", error);
});

console.log(
  "⬆️ PDF Upload Worker - Worker is initialized and waiting for jobs..."
);
