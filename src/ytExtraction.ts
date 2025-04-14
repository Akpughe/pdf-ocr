import { Innertube } from "youtubei.js";
import axios from "axios";
import { parseStringPromise } from "xml2js";
import CustomError from "./helpers/custom-error";
import { franc } from "franc";
import * as deepl from "deepl-node";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

if (!process.env.DEEPL_API_KEY) {
  throw new Error("DEEPL_API_KEY environment variable is not set");
}

const translator = new deepl.Translator(process.env.DEEPL_API_KEY);

export async function getTranscriptFromVideo(url: string) {
  const youtube = await Innertube.create({
    lang: "en",
    location: "US",
    retrieve_player: false,
  });

  // Extract video ID from the URL
  const videoId = new URL(url).searchParams.get("v");

  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  // Get the video information
  const video = await youtube.getInfo(videoId);
  const transcript = video?.captions?.caption_tracks?.[0];
  const title = video?.basic_info.title;
  const captionLanguageCode =
    // @ts-ignore
    video.captions?.translation_languages[0]?.language_name || "unknown";

  // console.log("video info:", video);

  if (!transcript) {
    throw new CustomError("No transcript available for this video", 400);
    // console.log("No transcript available for this video.");
    // throw new Error("No transcript available for this video.");

    // return;
  }

  // Fetch the transcript from the base URL
  const transcriptResponse = await axios.get(transcript.base_url);

  // Parse the XML using xml2js
  const result = await parseStringPromise(transcriptResponse.data);

  let transcriptText = "";

  // Extract and format the transcript
  result.transcript.text.forEach((textBlock: any) => {
    const start = parseFloat(textBlock.$.start);
    const textContent = textBlock._;

    // Convert start time to [hh:mm:ss] format
    const time = new Date(start * 1000).toISOString().substr(11, 8);
    transcriptText += `[${time}] ${textContent}\n`;
  });

  const sampleText = transcriptText.substring(
    0,
    Math.min(transcriptText.length, 1000)
  );
  const detectedLanguage = franc(sampleText);
  const isEnglish = detectedLanguage === "eng";

  let translatedText = transcriptText;
  if (!isEnglish) {
    console.log(
      `Detected non-English language: ${detectedLanguage}. Translating...`
    );
    try {
      translatedText = await translateToEnglish(transcriptText);

      console.log("Translation successful");
    } catch (error) {
      console.error("Translation failed:", error);
      // You can decide whether to throw an error or return the original text
    }
  }

  console.log(`Caption track language code: ${captionLanguageCode}`);
  console.log(`Detected language: ${detectedLanguage}`);
  console.log(`Is English: ${isEnglish}`);
  // console.log(`Translated text: ${translatedText}`);

  return {
    title,
    transcriptText: isEnglish ? transcriptText : translatedText,
    originalTranscript: isEnglish ? null : transcriptText,
    language: detectedLanguage,
    isEnglish,
    wasTranslated: !isEnglish,
  };
}

export const checkVideoDuration = async (url: string) => {
  const youtube = await Innertube.create({
    lang: "en",
    location: "US",
    retrieve_player: false,
  });

  // Extract video ID from the URL
  const videoId = new URL(url).searchParams.get("v");

  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  const video = await youtube.getInfo(videoId);
  const duration = video?.basic_info?.duration;

  return duration;
};

export function formatYouTubeLinkAndGetID(shortUrl: string): {
  formattedUrl: string;
  videoId: string | null;
} {
  try {
    const url = new URL(shortUrl);
    let videoId: string | null = null;

    if (url.hostname === "youtu.be") {
      // Extract video ID from youtu.be short URL
      videoId = url.pathname.substring(1);
    } else if (
      url.hostname === "www.youtube.com" ||
      url.hostname === "youtube.com"
    ) {
      // Extract video ID from regular YouTube URL
      videoId = url.searchParams.get("v");
    }

    // If we have a video ID, return the formatted full URL
    if (videoId) {
      const formattedUrl = `https://www.youtube.com/watch?v=${videoId}`;
      return { formattedUrl, videoId };
    }

    throw new Error("No video ID found");
  } catch (error) {
    throw new Error("Invalid URL");
  }
}

/**
 * Translates text from any language to English using DeepL
 * This function uses automatic language detection for maximum reliability
 *
 * @param text The text to translate to English
 * @param apiKey DeepL API key (optional if set elsewhere)
 * @returns Promise with the translated text
 */
export async function translateToEnglish(
  text: string,
  apiKey?: string
): Promise<string> {
  // Don't translate empty text
  if (!text || text.trim() === "") {
    return text;
  }

  try {
    // Maximum DeepL text size per request (30K is their limit, but use less to be safe)
    const maxChunkSize = 5000;
    let translatedText = "";

    // Process text in chunks if it's longer than maxChunkSize
    if (text.length <= maxChunkSize) {
      // Simple case - translate the whole text at once
      console.log("Translating text chunk (single chunk)...");
      const result = await translator.translateText(text, null, "en-US");
      translatedText = result.text;
    } else {
      // Split text into chunks by maintaining line breaks
      const lines = text.split("\n");
      let currentChunk = "";
      let chunkCount = 0;

      for (const line of lines) {
        // If adding this line would exceed the chunk size, translate current chunk
        if (
          currentChunk.length + line.length + 1 > maxChunkSize &&
          currentChunk.length > 0
        ) {
          chunkCount++;
          console.log(`Translating text chunk ${chunkCount}...`);
          const result = await translator.translateText(
            currentChunk,
            null,
            "en-US"
          );
          translatedText += result.text + "\n";
          currentChunk = line;
        } else {
          // Add the line to the current chunk
          currentChunk += (currentChunk ? "\n" : "") + line;
        }
      }

      // Translate the remaining chunk if it's not empty
      if (currentChunk) {
        chunkCount++;
        console.log(`Translating final text chunk ${chunkCount}...`);
        const result = await translator.translateText(
          currentChunk,
          null,
          "en-US"
        );
        translatedText += result.text;
      }

      console.log(`Completed translation of ${chunkCount} chunks`);
    }

    if (!translatedText) {
      throw new Error("Translation resulted in empty text");
    }

    // console.log("translatedText", translatedText);

    return translatedText;
  } catch (error: any) {
    console.error("Translation error:", error);
    if (error.message.includes("DeepL API error")) {
      console.error("DeepL API details:", error.response?.data);
    }
    throw new Error(`Failed to translate text: ${error.message}`);
  }
}

export async function getVideoTitle(url: string) {
  const youtube = await Innertube.create({
    lang: "en",
    location: "US",
    retrieve_player: false,
  });

  // Extract video ID from the URL
  let videoId: string | null = null;
  if (url.includes("youtu.be/")) {
    videoId = url.split("youtu.be/")[1].split("?")[0].split("&")[0];
  } else if (url.includes("youtube.com/watch?v=")) {
    videoId = url.split("watch?v=")[1].split("&")[0];
  } else if (url.includes("youtube.com/v/")) {
    videoId = url.split("/v/")[1].split("?")[0].split("&")[0];
  } else if (url.includes("youtube.com/embed/")) {
    videoId = url.split("/embed/")[1].split("?")[0].split("&")[0];
  }

  if (!videoId) {
    throw new Error("Invalid YouTube URL");
  }

  // Get the video information
  const video = await youtube.getInfo(videoId);
  const title = video?.basic_info.title;

  if (!title) {
    throw new CustomError("Could not retrieve video title", 400);
  }

  return { title };
}
