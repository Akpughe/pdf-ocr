import { Innertube } from "youtubei.js";
import axios from "axios";
import { parseStringPromise } from "xml2js";
import CustomError from "./helpers/custom-error";

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

  console.log("video info:", video);

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

  return { title, transcriptText };
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
