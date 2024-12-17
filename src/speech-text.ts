import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AutomaticSpeechRecognition } from "deepinfra";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import util from "util";
// @ts-ignore
import { convertAndSaveAudio } from "light-audio-converter";

// Load environment variables
dotenv.config();

const execPromise = util.promisify(exec);

/**
 * Convert input audio file to MP3 format
 * @param inputPath Path to the input audio file
 * @returns Path to the converted MP3 file
 */
// export async function convertToMp3(inputPath: string): Promise<string> {
//   // Generate output path for MP3
//   const outputPath = path.join(
//     path.dirname(inputPath),
//     `converted-${Date.now()}.mp3`
//   );

//   try {
//     // Use FFmpeg to convert to MP3
//     await execPromise(
//       `ffmpeg -i "${inputPath}" -acodec libmp3lame -b:a 128k "${outputPath}"`
//     );

//     // Optional: Remove original file
//     fs.unlinkSync(inputPath);

//     return outputPath;
//   } catch (error) {
//     console.error("Conversion error:", error);
//     throw new Error("Failed to convert audio file to MP3");
//   }
// }

export async function convertAudioToMp3(
  inputFilePath: string
): Promise<string> {
  // Check if the file is already an MP3
  if (path.extname(inputFilePath).toLowerCase() === ".mp3") {
    return inputFilePath; // No conversion needed
  }

  // Generate output file path
  const outputFilePath = path.join(
    path.dirname(inputFilePath),
    `converted-${Date.now()}.mp3`
  );

  try {
    // Perform conversion using light-audio-converter
    const result = await convertAndSaveAudio(
      inputFilePath,
      "mp3",
      outputFilePath
    );

    console.log("Audio converted successfully:", result.data);

    // Optionally delete the original file
    fs.unlinkSync(inputFilePath);

    return outputFilePath;
  } catch (error) {
    console.error("Audio conversion failed:", error);
    throw new Error("Failed to convert audio to MP3 format.");
  }
}

/**
 * Check if the file is already an MP3
 * @param filePath Path to the file
 * @returns boolean indicating if the file is an MP3
 */
export function isMP3File(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".mp3";
}

// Multer setup to store audio files on disk
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads");
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `audio-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  // fileFilter: (req, file, cb) => {
  //   // Accept audio files
  //   const allowedMimeTypes = [
  //     "audio/mpeg",
  //     "audio/wav",
  //     "audio/mp3",
  //     "audio/x-wav",
  //     "audio/m4a",
  //   ];
  //   if (allowedMimeTypes.includes(file.mimetype)) {
  //     cb(null, true);
  //   } else {
  //     cb(new Error("Invalid file type. Only audio files are allowed."));
  //   }
  // },
});

// Async function to handle speech recognition
export const speechRecognitionController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Ensure a file was uploaded
  if (!req.file) {
    res.status(400).json({ message: "No audio file uploaded" });
    return;
  }

  let finalAudioPath = req.file.path;

  try {
    // Convert file to MP3 if not already

    finalAudioPath = await convertAudioToMp3(finalAudioPath);

    const DEEPINFRA_API_KEY =
      process.env.DEEPINFRA_TOKEN || "IffddRCm3zn4A58ddmRpSR39oIU7foiw";
    const MODEL = "openai/whisper-large-v3-turbo";

    if (!DEEPINFRA_API_KEY) {
      res.status(500).json({ message: "DeepInfra API key is not configured" });
      return;
    }

    // Initialize the speech recognition client
    const client = new AutomaticSpeechRecognition(MODEL, DEEPINFRA_API_KEY);

    const input = {
      audio: finalAudioPath,
    };

    const response = await client.generate(input);

    fs.unlinkSync(finalAudioPath);

    res.status(200).json({
      text: response.text,
    });
  } catch (error) {
    console.error("Speech Recognition Error:", error);

    // Attempt to remove the file if it exists
    if (finalAudioPath) {
      try {
        fs.unlinkSync(finalAudioPath);
      } catch (unlinkError) {
        console.error("Could not delete uploaded file:", unlinkError);
      }
    }

    // res.status(500).json({
    //   message: "Failed to process audio file",
    //   error: error instanceof Error ? error.message : "Unknown error",
    // });
    next(error);
  }
};

// Add the route to the existing Express app
export function setupSpeechRecognitionRoute(app: express.Application) {
  app.post(
    "/speech-to-text",
    upload.single("audioFile"),
    speechRecognitionController
  );
}
