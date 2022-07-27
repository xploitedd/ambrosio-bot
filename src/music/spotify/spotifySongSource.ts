import SpotifyWebApi from "spotify-web-api-node";
import { Readable } from "stream";
import { MusicInfo, PlayerSingleSource } from "../sources";
import YoutubeTextSource from "../youtube/youtubeTextSource";

const spotifyRegex = () => new RegExp(/^(?:http(?:s)?:\/\/)?open.spotify.com\/track\/([A-z0-9-_]+)/gm)

export default class SpotifySongSource implements PlayerSingleSource {
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

    async getInfo(query: string): Promise<MusicInfo> {
        const regexRes = spotifyRegex().exec(query)
        if (!regexRes)
            throw new Error(`Invalid spotify song query "${query}"`)

        const trackId = regexRes[1]
        const track = await this._spotifyApi.getTrack(trackId)
        const body = track.body

        const title = body.name
        const artist = body.artists[0].name

        const composedQuery = `${artist} - ${title}`
        return this._youtubeTextSource.getInfo(composedQuery)
    }

    async getStream(info: MusicInfo): Promise<Readable> {
        return this._youtubeTextSource.getStream(info)
    }
}