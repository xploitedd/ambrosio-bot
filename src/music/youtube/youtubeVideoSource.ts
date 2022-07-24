import { Readable } from "stream";
import ytdl from "ytdl-core";
import { MusicInfo, PlayerSingleSource } from "../sources";

export default class YoutubePlayerSource implements PlayerSingleSource {
    matchesSource(query: string): boolean {
        try {
            const url = new URL(query)
            if (url.hostname !== "youtube.com" && url.hostname !== "www.youtube.com")
                return false
    
            if (url.pathname !== "/watch")
                return false
    
            const params = new URLSearchParams(url.searchParams)
            if (params.has("list"))
                return false

            const videoId = params.get("v")
            if (videoId === null || videoId.length < 11)
                return false

            return true
        } catch (e) {
            return false
        }
    }

    async getInfo(query: string): Promise<MusicInfo> {
        const info = await ytdl.getInfo(query)
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

    async getStream(query: string): Promise<Readable> {
        return ytdl(
            query, 
            { 
                quality: "highestaudio", 
                filter: "audioonly",
                highWaterMark: 1 << 62,
                liveBuffer: 1 << 62,
                dlChunkSize: 0
            }
        )
    }
}