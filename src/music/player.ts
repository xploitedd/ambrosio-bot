import { AudioPlayer, AudioPlayerStatus, AudioResource, entersState, PlayerSubscription, VoiceConnection } from "@discordjs/voice";
import EventEmitter from "events";
import { Readable } from "stream";
import { logger } from "../app";
import PlayerSourceRegistry, { MusicInfo, PlayerSingleSource, isPlaylistSource, isSingleSource, PlayerSource } from "./sources";
import _ from "lodash"

interface QueueItem {
    info: MusicInfo
    source: PlayerSingleSource
}

interface FutureQueueItem {
    query: string
    info: Promise<MusicInfo>
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

    private _getPlayerSource(query: string): PlayerSource | null {
        const playerSource = this._sourceRegistry.getSource(query)
        if (playerSource === null) {
            logger.warn(`No source found for the query: "${query}"`)
            return null
        }

        return playerSource
    }

    private async _playMultiple(items: string[]): Promise<boolean> {
        const first = items.shift()
        if (!first)
            return false

        const infoMap = items.map(it => {
            const source = this._getPlayerSource(it)
            if (source === null || !isSingleSource(source))
                return null

            return { query: it, info: source.getInfo(it), source } as FutureQueueItem
        }).filter(it => it !== null) as FutureQueueItem[]

        for (const future of infoMap) {
            try {
                const info = await future.info
                this._queue.push({ info, source: future.source })
            } catch (e) {
                logger.warn(`Cannot enqueue a video with query "${future.query}. Reason: ${e}"`)
            }
        }

        return await this.play(first)
    }

    private async _end() {
        this._audioPlayer.removeAllListeners()
        this._playing = undefined
        this.emit("end")
    }

    private async _skipToNext() {
        logger.debug(`The queue currently has ${this._queue.length} entries.`)
        const next = this._queue.shift()
        if (!next) {
            this._end()
            return
        }

        const info = next.info
        const stream = await next.source.getStream(info)
        await this._play(info, stream)
    }

    private _addToQueue(info: MusicInfo, source: PlayerSingleSource) {
        this._queue.push({
            info,
            source
        })

        this.emit("queued", info)
    }

    async play(query: string): Promise<boolean> {
        try {
            const playerSource = this._getPlayerSource(query)
            if (playerSource === null)
                return false

            if (isPlaylistSource(playerSource)) {
                logger.debug(`Fetching playlist items for query "${query}"`)
                const queryItems = await playerSource.getQueryItems(query)
                logger.debug(`Playlist "${query}" found with ${queryItems.length} items`)

                return this._playMultiple(queryItems)
            } else if (!isSingleSource(playerSource)) {
                logger.error(`Invalid player source type found for "${query}" - ${playerSource}`)
                return false
            }

            logger.debug(`Fetching stream data for "${query}"`)

            const info = await playerSource.getInfo(query)
            if (this._playing) {
                this._addToQueue(info, playerSource)
                return true
            }

            this._audioPlayer.on("stateChange", async (oldState, newState) => {
                if (newState.status === AudioPlayerStatus.Idle) {
                    for (; ;) {
                        try {
                            await this._skipToNext()
                            break
                        } catch (e) {
                            logger.error(`An error occurred while trying to play "${info.query}": ${e}`)
                        }
                    }
                } else if (newState.status === AudioPlayerStatus.Playing) {
                    this.emit("playing", this._playing)
                } else if (newState.status === AudioPlayerStatus.AutoPaused) {
                    try {
                        await entersState(this._audioPlayer, AudioPlayerStatus.Playing, 5_000)
                    } catch (e) {
                        logger.warn(`The music player could not resume`)
                        this._queue = []
                        this._audioPlayer.stop(true)
                        this._end()
                    }
                }
            })

            this._audioPlayer.on("error", error => {
                logger.error(`An error occurred while trying to play a music: ${error.message}`)
            })

            this._play(info, await playerSource.getStream(info))
            return true
        } catch (e) {
            logger.error(`Unexpected error in music player: ${e}`)
            return false
        }
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

    getCurrentMusic(): MusicInfo | undefined {
        return this._playing
    }

    shuffleQueue() {
        if (this._queue.length > 0) {
            this._queue = _.shuffle(this._queue)
            this.emit("playing", this._playing)
        }
    }
}