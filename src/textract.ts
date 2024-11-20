import AWS from "aws-sdk";
import sharp from "sharp";
import * as pdfjsLib from "pdfjs-dist";
import { createCanvas, loadImage } from "canvas";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
});

const textract = new AWS.Textract();

interface TextractBlock {
  BlockType?: string;
  Text?: string;
}

interface TextractProcessingResult {
  text: string;
  rawBlocks: TextractBlock[];
}

export async function processTextract(
  documentBuffer: Buffer
): Promise<TextractProcessingResult> {
  try {
    // First, try to extract text directly from PDF
    const pdfText = await extractTextFromPDF(documentBuffer);
    if (pdfText.trim()) {
      return {
        text: pdfText,
        rawBlocks: [],
      };
    }

    // If PDF text extraction fails, try Textract
    const params: AWS.Textract.DetectDocumentTextRequest = {
      Document: {
        Bytes: documentBuffer,
      },
    };

    const textractResult = await textract.detectDocumentText(params).promise();

    // Extract text lines
    const extractedText = textractResult.Blocks?.filter(
      (block) => block.BlockType === "LINE"
    )
      .map((block) => block.Text)
      .filter((text) => text)
      .join("\n");

    return {
      text: extractedText || "",
      rawBlocks: textractResult.Blocks || [],
    };
  } catch (error) {
    console.error("AWS Textract Error:", error);

    // Final fallback: try basic text extraction
    const fallbackText = await extractTextFromPDF(documentBuffer);

    return {
      text: fallbackText,
      rawBlocks: [],
    };
  }
}

async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // Convert Buffer to Uint8Array
    const uint8Array = new Uint8Array(
      pdfBuffer.buffer,
      pdfBuffer.byteOffset,
      pdfBuffer.length
    );

    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      const pageText = textContent.items.map((item: any) => item.str).join(" ");

      fullText += pageText + "\n";
    }

    return fullText.trim();
  } catch (error) {
    console.error("PDF Text Extraction Error:", error);
    return "";
  }
}
