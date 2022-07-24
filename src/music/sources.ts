import { Readable } from "stream";
import { logger } from "../app";

export interface MusicInfo {
    query: string
    title: string
    thumbnail: string
    url: string
    author: {
        name: string
        photo: string
    }
}

export interface PlaylistQueryOptions {
    limit?: number
}

export interface PlayerSource {
    matchesSource(query: string): boolean
}

export interface PlayerSingleSource extends PlayerSource {
    getInfo(query: string): Promise<MusicInfo>
    getStream(info: MusicInfo): Promise<Readable>
}

export interface PlayerPlaylistSource extends PlayerSource {
    getQueryItems(query: string, options?: PlaylistQueryOptions): Promise<string[]>
}

export default class PlayerSourceRegistry {
    private readonly _sources: PlayerSource[] = []
    private _fallback?: PlayerSource

    addSource(playerSource: PlayerSource): PlayerSourceRegistry {
        this._sources.push(playerSource)
        return this
    }

    setFallback(playerSource: PlayerSource): PlayerSourceRegistry {
        this._fallback = playerSource
        return this
    }

    getSource(query: string): PlayerSource | null {
        for (const source of this._sources) {
            if (source.matchesSource(query)) {
                logger.debug(`Found a player source that matches "${query}"`)
                return source
            }
        }

        if (this._fallback?.matchesSource(query)) {
            logger.debug(`Using the fallback player source for "${query}"`)
            return this._fallback
        }

        logger.warn(`No player source has been found for "${query}"`)
        return null
    }
}

export function isSingleSource(source: PlayerSource): source is PlayerSingleSource {
    return (source as PlayerSingleSource).getStream !== undefined
}

export function isPlaylistSource(source: PlayerSource): source is PlayerPlaylistSource {
    return (source as PlayerPlaylistSource).getQueryItems !== undefined
}