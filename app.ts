import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { extractTextFromPDF } from "./src/ocrService";
import util from "util";
import cors from "cors";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import dotenv from "dotenv";
import {
  checkVideoDuration,
  formatYouTubeLinkAndGetID,
  getTranscriptFromVideo,
  getVideoTitle,
} from "./src/ytExtraction";

import { processTextract } from "./src/textract";
import { setupSpeechRecognitionRoute } from "./src/speech-text";
import { uploadProcess } from "./src/worker/pdf-upload";
import { initUpload } from "./src/job/upload";
import { globalErrorHandler } from "./src/helpers/error-handler";
import {
  expirationWorker,
  cancellationWorker,
} from "./src/worker/subscription";
import { redisConnection } from "./src/config/redis";

// Load environment variables first
dotenv.config();

const app = express();
const port: any = process.env.PORT || 4000;

export const subscriptionQueue = new Queue("subscription-queue", {
  connection: redisConnection,
});

export const subscriptionExpirationQueue = new Queue(
  "subscription-expiration-queue",
  {
    connection: redisConnection,
  }
);

export const subscriptionCancellationQueue = new Queue(
  "subscription-cancellation-queue",
  {
    connection: redisConnection,
  }
);

export const fileUploadQueue = new Queue("file-upload-queue", {
  connection: redisConnection,
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const subscriptionQueueAdapter = new BullMQAdapter(subscriptionQueue);
const subscriptionExpirationQueueAdapter = new BullMQAdapter(
  subscriptionExpirationQueue
);
const subscriptionCancellationQueueAdapter = new BullMQAdapter(
  subscriptionCancellationQueue
);
// const fileUploadQueueAdapter = new BullMQAdapter(fileUploadQueue);

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    subscriptionQueueAdapter,
    subscriptionExpirationQueueAdapter,
    subscriptionCancellationQueueAdapter,
  ],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// allow body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Use the cors middleware to enable CORS
app.use(
  cors({
    origin: "*", // Specify the allowed origin
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Specify allowed HTTP methods
    credentials: true, // Allow cookies and credentials
  })
);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, PUT");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Multer setup to store files in memory (buffer)
// const storage = multer.memoryStorage();
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });
const uploadMiddleware = util.promisify(upload.single("pdfFile"));

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});

// Endpoint to trigger file upload
app.post("/upload", upload.single("file"), initUpload);

// POST endpoint to upload a PDF
// app.post(
//   "/ocr-pdf",
//   upload.single("pdfFile"),
//   async (req: Request, res: Response): Promise<void> => {
//     if (!req.file) {
//       res.status(400).json({ message: "No file uploaded" });
//       return;
//     }

//     try {
//       const fileBuffer = req.file?.buffer;

//       const text = await extractTextFromPDF(fileBuffer);
//       res.status(200).json({ text: text });
//     } catch (error) {
//       console.error("Error extracting text:", error);
//       res.status(500).json({ message: "Failed to extract text from PDF" });
//     }
//   }
// );

// export async function textractController(req: Request, res: Response) {
//   if (!req.file) {
//     return res.status(400).json({ message: "No file uploaded" });
//   }

//   try {
//     const result = await processTextract(req.file.buffer);

//     res.status(200).json({
//       text: result.text,
//       rawBlocks: result.rawBlocks,
//     });
//   } catch (error) {
//     console.error("Textract Route Error:", error);
//     res.status(500).json({
//       message: "Failed to process document with Textract",
//       error: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// }
// @ts-ignore
// app.post("/textract", upload.single("document"), textractController);

app.post("/yt-ocr", async (req: Request, res: Response, next: NextFunction) => {
  const { url } = req.body;

  try {
    const { formattedUrl } = formatYouTubeLinkAndGetID(url);

    const transcript = await getTranscriptFromVideo(formattedUrl);

    res
      .status(200)
      .json({ title: transcript?.title, text: transcript?.transcriptText });
  } catch (error) {
    next(error);
    // res
    //   .status(500)
    //   .json({ message: "Failed to get transcript from YouTube video" });
  }
});

app.post(
  "/yt-video-duration",
  async (req: Request, res: Response, next: NextFunction) => {
    const { url } = req.body;

    try {
      const { formattedUrl } = formatYouTubeLinkAndGetID(url);

      const duration = await checkVideoDuration(formattedUrl);

      res.status(200).json({ duration });
    } catch (error) {
      next(error);
      // res
      //   .status(500)
      //   .json({ message: "Failed to get transcript from YouTube video" });
    }
  }
);

app.post(
  "/yt-video-title",
  async (req: Request, res: Response, next: NextFunction) => {
    const { url } = req.body;

    try {
      const { formattedUrl } = formatYouTubeLinkAndGetID(url);

      const result = await getVideoTitle(formattedUrl);

      res.status(200).json({ title: result.title });
    } catch (error) {
      next(error);
    }
  }
);

setupSpeechRecognitionRoute(app);

// catch errors
// app.use((err: any, req: Request, res: Response, next: NextFunction) => {
//   console.error(err);
//   res.status(500).json({ message: "Internal server error" });
// });

// @ts-ignore
app.use(globalErrorHandler);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`BullMQ UI: http://localhost:${port}/admin/queues`);
});

// uploadProcess.on("completed", (job: any) => {
//   console.log(`Job ${job.id} has completed!`);
// });

// uploadProcess.on("failed", (job: any, err) => {
//   console.error(`Job ${job.id} has failed with error ${err.message}`);
// });

expirationWorker.on("completed", (job: any) => {
  console.log(`Job ${job.id} has completed!`);
});

cancellationWorker.on("completed", (job: any) => {
  console.log(`Job ${job.id} has completed!`);
});

expirationWorker.on("failed", (job: any, err) => {
  console.error(`Job ${job.id} has failed with error ${err.message}`);
});

cancellationWorker.on("failed", (job: any, err) => {
  console.error(`Job ${job.id} has failed with error ${err.message}`);
});
