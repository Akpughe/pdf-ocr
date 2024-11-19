import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { extractTextFromPDF } from "./src/ocrService";
import util from "util";
import cors from "cors";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import {
  formatYouTubeLinkAndGetID,
  getTranscriptFromVideo,
} from "./src/ytExtraction";

const app = express();

const port: any = process.env.PORT || 4000;

const redis_url = process.env.REDIS_URL || "redis://localhost:6379";

const router = express.Router();

// Redis connection
export const connection = new IORedis(redis_url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const subscriptionQueue = new Queue("subscription-queue", {
  connection,
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullMQAdapter(subscriptionQueue)],
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
const storage = multer.memoryStorage();
const upload = multer({ storage });
const uploadMiddleware = util.promisify(upload.single("pdfFile"));

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World");
});

// POST endpoint to upload a PDF
app.post(
  "/ocr-pdf",
  upload.single("pdfFile"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    try {
      const fileBuffer = req.file?.buffer;

      const text = await extractTextFromPDF(fileBuffer);
      res.status(200).json({ text: text });
    } catch (error) {
      console.error("Error extracting text:", error);
      res.status(500).json({ message: "Failed to extract text from PDF" });
    }
  }
);

app.post("/yt-ocr", async (req: Request, res: Response) => {
  const { url } = req.body;

  try {
    const { formattedUrl } = formatYouTubeLinkAndGetID(url);

    const transcript = await getTranscriptFromVideo(formattedUrl);

    res
      .status(200)
      .json({ title: transcript?.title, text: transcript?.transcriptText });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to get transcript from YouTube video" });
  }
});

// catch errors
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`BullMQ UI: http://localhost:${port}/admin/queues`);
});
