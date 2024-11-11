import { Innertube } from "youtubei.js";
import axios from "axios";
import { parseStringPromise } from "xml2js";

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

  if (!transcript) {
    console.log("No transcript available for this video.");
    return;
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

  return { title, transcriptText };
}

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
