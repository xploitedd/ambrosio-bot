import SpotifyWebApi from "spotify-web-api-node";
import { PlayerPlaylistSource, PlaylistQueryOptions } from "../sources";
import YoutubeTextSource from "../youtube/youtubeTextSource";

const MAX_LIMIT = 150
const MAX_LIMIT_PER_PAGE = 50

const spotifyRegex = () => new RegExp(/^(?:http(?:s)?:\/\/)?open.spotify.com\/playlist\/([A-z0-9-_]+)/gm)

export default class SpotifyPlaylistSource implements PlayerPlaylistSource {
    private readonly _spotifyApi: SpotifyWebApi
    private readonly _youtubeTextSource: YoutubeTextSource

    constructor({
        spotifyApi,
        youtubeTextSource
    }: {
        spotifyApi: SpotifyWebApi,
        youtubeTextSource: YoutubeTextSource
    }) {
        this._spotifyApi = spotifyApi
        this._youtubeTextSource = youtubeTextSource
    }

    matchesSource(query: string): boolean {
        return spotifyRegex().test(query)
    }

    async getQueryItems(query: string, options?: PlaylistQueryOptions): Promise<string[]> {
        const regexRes = spotifyRegex().exec(query)
        if (!regexRes)
            throw new Error(`Invalid spotify playlist query "${query}"`)

        const playlistId = regexRes[1]

        let requestedLimit = options?.limit ?? MAX_LIMIT
        if (requestedLimit > MAX_LIMIT)
            requestedLimit = MAX_LIMIT

        const itemsPerQuery = requestedLimit > MAX_LIMIT_PER_PAGE ? MAX_LIMIT_PER_PAGE : requestedLimit

        const videoUrls: string[] = []

        let offset = 0
        while (requestedLimit > 0) {
            const res = await this._spotifyApi.getPlaylistTracks(playlistId, {
                fields: "items(track(name,artists(name)))",
                limit: itemsPerQuery,
                offset
            })

            const items = res.body.items
            if (items.length === 0)
                break

            const tracks = items.map(it => it.track)
                .filter(it => it !== null)
                .map(it => `${it?.artists[0].name} - ${it?.name}`)
                .map(it => this._youtubeTextSource.getInfo(it))

            const completed = await Promise.all(tracks)

            videoUrls.push(...completed.map(it => it.url))
            offset += itemsPerQuery
            requestedLimit -= itemsPerQuery
        }

        return videoUrls
    }
}