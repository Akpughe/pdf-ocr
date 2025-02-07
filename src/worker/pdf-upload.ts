import { Worker } from "bullmq";
// import { supabase } from "../sb-config";
import IORedis from "ioredis";
import { redis_url } from "../../app";
import { Queue } from "bullmq";
import { supabase } from "../config/supabaseClient";
import { sanitizeFileName } from "../helpers/santizeFile";

const connection = new IORedis(redis_url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Process jobs
export const uploadProcess = new Worker(
  "file-upload-queue",
  async (job: any) => {
    const { file_path, pdf_id } = job.data;

    // Simulate file upload logic
    console.log(`Uploading file: ${file_path} for user: ${pdf_id}`);

    const buffer = await file_path.arrayBuffer();

    // Generate a unique file path
    const timestamp = new Date().getTime();
    const sanitizedFileName = sanitizeFileName(file_path?.name);
    const filePath = `${timestamp}_${sanitizedFileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("pdf_files")
      .upload(filePath, buffer, {
        contentType: file_path?.type,
        upsert: false, // Prevent overwriting existing files
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: publicURL } = supabase.storage
      .from("pdf_files")
      .getPublicUrl(uploadData.path);

    // Update PDF metadata into database
    const { data: pdfRecord, error: pdfError } = await supabase
      .from("pdfs")
      .update({
        file_path: publicURL.publicUrl,
      })
      .eq("id", pdf_id);

    if (pdfError) throw pdfError;

    // await new Promise((resolve) => setTimeout(resolve, 5000)); // Simulate upload delay

    // Notify the user (e.g., via WebSocket or HTTP callback)
    console.log(`File ${file_path} uploaded successfully for pdf ${pdf_id}`);
  },
  { connection }
);

console.log("⬆️ uploadProcess - Worker is running and listening for jobs...");
