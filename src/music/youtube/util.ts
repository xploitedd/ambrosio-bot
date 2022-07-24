import { Readable } from "stream";
import ytdl from "ytdl-core";
import { MusicInfo } from "../sources";

export function getYoutubeStream(url: string): Readable {
    return ytdl(
        url, 
        { 
            quality: "lowestaudio", 
            filter: "audioonly",
            highWaterMark: 1 << 62,
            liveBuffer: 1 << 62,
            dlChunkSize: 0
        }
    )
}

export function videoInfoToMusicInfo(query: string, info: ytdl.videoInfo): MusicInfo {
    return {
        query,
        title: info.videoDetails.title,
        thumbnail: info.videoDetails.thumbnails[2].url,
        url: info.videoDetails.video_url,
        author: {
            name: info.videoDetails.author.name,
            photo: info.videoDetails.author.thumbnails?.[0].url ?? info.videoDetails.author.avatar
        }
    }
}

export function getYoutubeUrl(videoId: string) {
    return `https://youtube.com/watch?v=${videoId}`
}