import { PlayerPlaylistSource, PlaylistQueryOptions } from "../sources";
import { youtube_v3 } from "googleapis";
import { logger } from "../../app";
import { getYoutubeUrl } from "./util";

const MAX_LIMIT = 50

export default class YoutubePlaylistSource implements PlayerPlaylistSource {
    private readonly _youtube: youtube_v3.Youtube
    
    constructor(options: { youtube: youtube_v3.Youtube }) {
        this._youtube = options.youtube
    }

    matchesSource(query: string): boolean {
        try {
            const url = new URL(query)
            if (url.hostname !== "youtube.com" && url.hostname !== "www.youtube.com")
                return false

            if (url.pathname !== "/watch")
                return false

            const params = new URLSearchParams(url.searchParams)
            const list = params.get("list")
            if (list === null || list.length < 13)
                return false

            return true
        } catch (e) {
            return false
        }
    }

    async getQueryItems(query: string, options?: PlaylistQueryOptions): Promise<string[]> {
        const params = new URLSearchParams(new URL(query).searchParams)
        const list = params.get("list")
        if (list === null) {
            logger.error(`Youtube Playlist - list parameter not found in query "${query}"`)
            throw new Error("Unexpected error")
        }

        const res = await this._youtube.playlistItems.list({
            playlistId: list,
            maxResults: options?.limit ?? MAX_LIMIT,
            part: ["contentDetails"]
        })

        const items = res.data.items
        if (!items) {
            logger.warn(`No playlist items returned for the query "${query}"`)
            throw new Error("No playlist items returned")
        }

        return items.filter(it => it.contentDetails !== undefined)
            .map(it => it.contentDetails?.videoId ?? "")
            .map(it => getYoutubeUrl(it))
    }
}