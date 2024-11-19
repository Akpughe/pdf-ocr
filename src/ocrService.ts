import { createCanvas } from "canvas";
import Tesseract from "tesseract.js";

// Use the proper path for pdfjs-dist
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

// Extract text from PDF buffer
export async function extractTextFromPDF(fileBuffer: Buffer) {
  const startTime = performance.now();

  // Convert Buffer to Uint8Array
  const uint8Array = new Uint8Array(fileBuffer);

  // Load the PDF document using PDF.js
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  // Array to hold promises for parallel page processing
  const textPromises = [];

  // Loop through each page of the PDF in parallel
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    textPromises.push(processPage(pdf, pageNum));
  }

  // Wait for all the pages to be processed in parallel
  const pageTexts = await Promise.all(textPromises);

  const endTime = performance.now();
  console.log(
    `Total PDF processing time: ${((endTime - startTime) / 1000).toFixed(
      2
    )} seconds`
  );

  // Join all page texts into a single string
  return pageTexts.join("\n");
}

async function processPage(pdf: any, pageNum: number) {
  try {
    const page = await pdf.getPage(pageNum);

    // Set up canvas to render the PDF page with a lower scale for faster processing
    const viewport = page.getViewport({ scale: 1.25 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    // Render the page to the canvas
    await page.render({ canvasContext: context, viewport }).promise;

    // Convert canvas to image data (data URL)
    const imageData = canvas.toDataURL("image/png");

    // Perform OCR on the image data using Tesseract.js
    const worker = await Tesseract.createWorker({
      corePath:
        "https://unpkg.com/tesseract.js-core@v4.0.2/tesseract-core.wasm.js",
    });

    try {
      // Load and initialize Tesseract worker
      // await worker.load();
      await worker.loadLanguage("eng");
      await worker.initialize("eng");

      // Set parameters
      await worker.setParameters({
        // @ts-ignore
        tessedit_pageseg_mode: "6",
        tessedit_char_whitelist:
          "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
      });

      // Recognize the text
      const { data } = await worker.recognize(imageData);

      // Terminate the worker after use
      await worker.terminate();

      // Return extracted text
      return data.text;
    } catch (error) {
      console.error(`Tesseract error on page ${pageNum}:`, error);
      await worker.terminate();
      return ""; // Return empty string if OCR fails on this page
    }
  } catch (error) {
    console.error(`Error processing page ${pageNum}:`, error);
    return ""; // Return empty string if rendering fails on this page
  }
}
