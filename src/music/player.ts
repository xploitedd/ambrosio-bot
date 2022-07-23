import { AudioPlayer, AudioPlayerStatus, AudioResource, PlayerSubscription, VoiceConnection } from "@discordjs/voice";
import EventEmitter from "events";
import { Readable } from "stream";
import { logger } from "../app";
import PlayerSourceRegistry, { MusicInfo, PlayerSingleSource, isPlaylistSource, isSingleSource } from "./sources";

interface QueueItem {
    info: MusicInfo
    source: PlayerSingleSource
}

export type PlayerProvider = () => AudioPlayer
export type ResourceProvider = (stream: Readable) => Promise<AudioResource>

export default class MusicPlayer extends EventEmitter {
    private readonly _sourceRegistry: PlayerSourceRegistry
    private readonly _audioPlayer: AudioPlayer
    private readonly _resourceProvider: ResourceProvider
    private _queue: QueueItem[] = []

    private _playing?: MusicInfo

    constructor(sourceRegistry: PlayerSourceRegistry, playerProvider: PlayerProvider, resourceProvider: ResourceProvider) {
        super()

        this._sourceRegistry = sourceRegistry
        this._audioPlayer = playerProvider()
        this._resourceProvider = resourceProvider
    }

    private async _play(info: MusicInfo, stream: Readable) {
        const resource = await this._resourceProvider(stream)

        this._playing = info
        this._audioPlayer.play(resource)
    }

    async play(query: string) {
        const playerSource = this._sourceRegistry.getSource(query)
        if (playerSource === null)
            throw new Error("No source found for the specified content")

        if (isPlaylistSource(playerSource)) {
            logger.debug(`Fetching playlist items for query "${query}"`)
            const queryItems = await playerSource.getQueryItems()
            for (const query of queryItems)
                await this.play(query)

            return
        } else if (!isSingleSource(playerSource)) {
            logger.error(`Invalid player source type found for "${query}" - ${playerSource}`)
            throw new Error("Invalid source type")
        }

        logger.debug(`Fetching stream data for "${query}"`)

        const info = await playerSource.getInfo(query)
        if (this._playing || this._queue.length > 0) {
            this._queue.push({
                info,
                source: playerSource
            })

            this.emit("queued", info)
            return
        }

        this._audioPlayer.on("stateChange", async (oldState, newState) => {
            if (newState.status === AudioPlayerStatus.Idle) {
                const next = this._queue.shift()
                if (!next) {
                    this._audioPlayer.removeAllListeners()
                    this._playing = undefined
                    this.emit("end")
                    return
                }

                const info = next.info
                const stream = await next.source.getStream(info.query)
                this._play(info, stream)
            } else if (newState.status === AudioPlayerStatus.Playing) {
                this.emit("playing", this._playing)
            }
        })

        this._play(info, await playerSource.getStream(query))
    }

    subscribe(voiceConnection: VoiceConnection): PlayerSubscription | undefined {
        return voiceConnection.subscribe(this._audioPlayer)
    }

    next() {
        this._audioPlayer.stop()
    }

    hasNext(): boolean {
        return this._queue.length > 0
    }

    clearQueue() {
        this._queue = []
    }

    getQueue(): MusicInfo[] {
        return this._queue.map(it => it.info)
    }
}