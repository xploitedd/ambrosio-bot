import { Readable } from "stream";
import ytdl from "ytdl-core";
import { MusicInfo, PlayerSingleSource } from "../sources";
import { getYoutubeStream, videoInfoToMusicInfo } from "./util";

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
        return videoInfoToMusicInfo(query, info)
    }

    async getStream(info: MusicInfo): Promise<Readable> {
        return getYoutubeStream(info.url)
    }
}