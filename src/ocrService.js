"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextFromPDF = extractTextFromPDF;
const canvas_1 = require("canvas");
const tesseract_js_1 = __importDefault(require("tesseract.js"));
// Use the proper path for pdfjs-dist
const pdfjsLib = __importStar(require("pdfjs-dist/legacy/build/pdf"));
// Set the worker path
// pdfjsLib.GlobalWorkerOptions.workerSrc =
//   "/node_modules/pdfjs-dist/build/pdf.worker.js";
// Extract text from PDF buffer
function extractTextFromPDF(fileBuffer) {
    return __awaiter(this, void 0, void 0, function* () {
        const startTime = performance.now();
        // Load the PDF document using PDF.js
        const loadingTask = pdfjsLib.getDocument({ data: fileBuffer });
        const pdf = yield loadingTask.promise;
        // Array to hold promises for parallel page processing
        const textPromises = [];
        // Loop through each page of the PDF in parallel
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            textPromises.push(processPage(pdf, pageNum));
        }
        // Wait for all the pages to be processed in parallel
        const pageTexts = yield Promise.all(textPromises);
        const endTime = performance.now();
        console.log(`Total PDF processing time: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
        // Join all page texts into a single string
        return pageTexts.join("\n");
    });
}
function processPage(pdf, pageNum) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const page = yield pdf.getPage(pageNum);
            // Set up canvas to render the PDF page with a lower scale for faster processing
            const viewport = page.getViewport({ scale: 1.25 });
            const canvas = (0, canvas_1.createCanvas)(viewport.width, viewport.height);
            const context = canvas.getContext("2d");
            // Render the page to the canvas
            yield page.render({ canvasContext: context, viewport }).promise;
            // Convert canvas to image data (data URL)
            const imageData = canvas.toDataURL("image/png");
            // Perform OCR on the image data using Tesseract.js
            const worker = yield tesseract_js_1.default.createWorker({
                corePath: "https://unpkg.com/tesseract.js-core@v4.0.2/tesseract-core.wasm.js",
            });
            try {
                // Load and initialize Tesseract worker
                yield worker.load();
                yield worker.loadLanguage("eng");
                yield worker.initialize("eng");
                // Set parameters
                yield worker.setParameters({
                    logger: (m) => console.log(m),
                    // @ts-ignore
                    tessedit_pageseg_mode: "6",
                    tessedit_char_whitelist: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
                });
                // Recognize the text
                const { data } = yield worker.recognize(imageData);
                // Terminate the worker after use
                yield worker.terminate();
                // Return extracted text
                return data.text;
            }
            catch (error) {
                console.error(`Tesseract error on page ${pageNum}:`, error);
                yield worker.terminate();
                return ""; // Return empty string if OCR fails on this page
            }
        }
        catch (error) {
            console.error(`Error processing page ${pageNum}:`, error);
            return ""; // Return empty string if rendering fails on this page
        }
    });
}
