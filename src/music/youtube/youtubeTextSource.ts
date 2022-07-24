import { youtube_v3 } from "googleapis";
import { Readable } from "stream";
import ytdl from "ytdl-core";
import { logger } from "../../app";
import { MusicInfo, PlayerSingleSource } from "../sources";
import { getYoutubeStream, getYoutubeUrl, videoInfoToMusicInfo } from "./util";

const MAX_RESULTS = 1

export default class YoutubeTextSource implements PlayerSingleSource {
    private readonly _youtube: youtube_v3.Youtube

    constructor(options: { youtube: youtube_v3.Youtube }) {
        this._youtube = options.youtube
    }

    matchesSource(): boolean {
        return true
    }

    async getInfo(query: string): Promise<MusicInfo> {
        const res = await this._youtube.search.list({
            part: ["snippet"],
            q: query,
            type: ["video"],
            maxResults: MAX_RESULTS
        })

        const items = res.data.items
        if (!items || items.length === 0) {
            logger.warn(`No items returned for the youtube text query: "${query}"`)
            throw new Error("No items returned for youtube search query")
        }

        const videoId = items[0].id?.videoId ?? null
        if (videoId === null) {
            logger.error(`No videoId found for youtube search query "${query}"`)
            throw new Error("No videoId for the specified search query")
        }

        const url = getYoutubeUrl(videoId)
        const info = await ytdl.getInfo(url)
        return videoInfoToMusicInfo(query, info)
    }

    async getStream(info: MusicInfo): Promise<Readable> {
        return getYoutubeStream(info.url)
    }
}