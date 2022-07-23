import { Readable } from "stream";
import ytdl from "ytdl-core";
import { MusicInfo, PlayerSingleSource } from "../sources";

export default class YoutubePlayerSource implements PlayerSingleSource {
    matchesSource(query: string): boolean {
        return ytdl.validateURL(query)
    }

    async getInfo(query: string): Promise<MusicInfo> {
        const info = await ytdl.getInfo(query)
        return {
            query,
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[0].url,
            url: info.videoDetails.video_url,
            author: {
                name: info.videoDetails.author.name,
                photo: info.videoDetails.author.avatar
            }
        }
    }

    async getStream(query: string): Promise<Readable> {
        return ytdl(query, { quality: "highestaudio", filter: "audioonly" })
    }
}