import { Readable } from "stream";

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

export interface PlayerSource {
    matchesSource(query: string): boolean
    getInfo(query: string): Promise<MusicInfo>
}

export interface PlayerSingleSource extends PlayerSource {
    getStream(query: string): Promise<Readable>
}

export interface PlayerPlaylistSource extends PlayerSource {
    getQueryItems(): Promise<string[]>
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
            if (source.matchesSource(query))
                return source
        }

        if (this._fallback?.matchesSource(query))
            return this._fallback

        return null
    }
}

export function isSingleSource(source: PlayerSource): source is PlayerSingleSource {
    return (source as PlayerSingleSource).getStream !== undefined
}

export function isPlaylistSource(source: PlayerSource): source is PlayerPlaylistSource {
    return (source as PlayerPlaylistSource).getQueryItems !== undefined
}