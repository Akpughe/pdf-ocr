import express, { Request, Response } from "express";
import multer from "multer";
import { extractTextFromPDF } from "./src/ocrService";
import util from "util";

const app = express();

const port = process.env.PORT || 6000;

// Multer setup to store files in memory (buffer)
const storage = multer.memoryStorage();
const upload = multer({ storage });
const uploadMiddleware = util.promisify(upload.single("pdfFile"));

// POST endpoint to upload a PDF
app.post("/ocr-pdf", async (req: Request, res: Response): Promise<void> => {
  try {
    await uploadMiddleware(req, res);

    // check for file
    if (!req.file) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    const fileBuffer = (req as any).file.buffer;

    const text = await extractTextFromPDF(fileBuffer);
    res.status(200).json({ text: text });
  } catch (error) {
    console.error("Error extracting text:", error);
    res.status(500).json({ message: "Failed to extract text from PDF" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
