import * as ytsearch from "youtube-search-without-api-key";
import { Readable } from "stream";
import ytdl from "ytdl-core";
import { MusicInfo, PlayerSingleSource } from "../sources";
import { getYoutubeStream, videoInfoToMusicInfo } from "./util";

export default class YoutubeTextSource implements PlayerSingleSource {
    matchesSource(): boolean {
        return true
    }

    async getInfo(query: string): Promise<MusicInfo> {
        const res = await ytsearch.search(query)
        if (res.length === 0)
            throw new Error(`No item found in youtube search query "${query}"`)

        const info = await ytdl.getInfo(res[0].url)
        return videoInfoToMusicInfo(query, info)
    }

    async getStream(info: MusicInfo): Promise<Readable> {
        return getYoutubeStream(info.url)
    }
}