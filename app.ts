import express, { NextFunction, Request, Response } from "express";
import multer from "multer";
import { extractTextFromPDF } from "./src/ocrService";
import util from "util";
import cors from "cors";

const app = express();

const port = process.env.PORT || 4000;

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

// catch errors
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
