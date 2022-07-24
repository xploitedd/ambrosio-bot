import { entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { ChannelType, ChatInputCommandInteraction, Client, Guild, GuildMember, Message, VoiceChannel } from "discord.js";
import { logger } from "../app";
import MusicPlayer from "./player";
import { MusicInfo } from "./sources";
import TextChannelManager from "./text";
import { createPlayingEmbed } from "./util";

export type MusicHandlerSupplier = (guild: Guild) => MusicHandler

export interface MusicHandlerOptions {
    discordClient: Client
    guild: Guild
    musicPlayer: MusicPlayer
    textManager: TextChannelManager
}

export default class MusicHandler {
    private readonly _discordClient: Client
    private readonly _musicPlayer: MusicPlayer
    private readonly _textManager: TextChannelManager

    private _currentChannel?: VoiceChannel

    public guild: Guild

    constructor({
        discordClient,
        guild,
        musicPlayer,
        textManager
    }: MusicHandlerOptions) {
        this._discordClient = discordClient
        this.guild = guild
        this._musicPlayer = musicPlayer
        this._textManager = textManager

        const setMessages = async (queue: MusicInfo[], info?: MusicInfo) => {
            try {
                await this._textManager.setPlaying(info)
                await this._textManager.setQueue(queue)
            } catch (e) {
                logger.error(`Error editing message: ${e}`)
            }
        }

        this._musicPlayer.on("playing", async (info: MusicInfo) => {
            await setMessages(this.getQueue(), info)
        })

        this._musicPlayer.on("queued", async () => {
            await setMessages(this.getQueue(), this._musicPlayer.getCurrentMusic())
        })

        this._musicPlayer.on("end", async () => {
            await setMessages([], undefined)
        })

        this._textManager.on("new_query", async (query: string, message: Message) => {
            try {
                const member = message.member as GuildMember
                const channel = member.voice.channel
                if (channel && channel.type === ChannelType.GuildVoice) {
                    await this.play(query, channel)
                }
            } catch (e) {
                logger.error(`Error parsing in channel query "${query}" on channel ${message.channelId}: ${e}`)
            }
        })
    }

    async play(query: string, voiceChannel: VoiceChannel, interaction?: ChatInputCommandInteraction) {
        let conn: VoiceConnection | null = null
        try {
            logger.debug(`Received music query "${query}" in guild ${voiceChannel.guildId}`)

            if (this._currentChannel) {
                if (this._currentChannel.id === voiceChannel.id) {
                    this._musicPlayer.once("queued", (info: MusicInfo) => {
                        logger.info(`A music has been queued (${info.title}) on voice channel ${voiceChannel.id} of guild ${voiceChannel.guildId}`)
                        interaction?.editReply({ content: `Added to the queue: ${info.title}` })
                    })

                    if (!await this._musicPlayer.play(query))
                        interaction?.editReply({ content: "Unfortunately we cannot play this music. Maybe try another one?" })
                } else {
                    // bot is busy in this guild
                    logger.debug(`Bot is busy in another VC. Requested: ${voiceChannel.id}, Current: ${this._currentChannel.id}`)
                    interaction?.editReply({ content: "I'm currently busy playing songs in another channel!" })
                }

                return
            }

            this._currentChannel = voiceChannel

            conn = joinVoiceChannel({
                guildId: this.guild.id,
                channelId: voiceChannel.id,
                adapterCreator: this.guild.voiceAdapterCreator
            })

            await entersState(conn, VoiceConnectionStatus.Ready, 5_000)
            const sub = this._musicPlayer.subscribe(conn)
            if (!sub)
                throw new Error("Error creating player subscription")

            this._musicPlayer.once("playing", (info: MusicInfo) => {
                logger.info(`Player has started playing on VC ${voiceChannel.id}. Song: ${info.title}`)

                const embed = createPlayingEmbed(info)
                interaction?.editReply({ embeds: [embed] })
            })

            this._musicPlayer.on("end", () => {
                logger.info(`The player has ended for VC ${voiceChannel.id}. Cleaning up...`)

                sub.unsubscribe()
                if (conn !== null)
                    conn.destroy()

                this._musicPlayer.removeAllListeners()
                this._currentChannel = undefined
            })

            if (!await this._musicPlayer.play(query))
                interaction?.editReply({ content: "Unfortunately we cannot play this music. Maybe try another one?" })
        } catch (e) {
            interaction?.editReply({ content: "An unexpected error has occurred while trying to play a music" })
            logger.error(`An error occurred, destroying voice connection on ${voiceChannel.id}. ${e}`)
            if (conn !== null)
                conn.destroy()

            this._currentChannel = undefined
        }
    }

    stop(interaction: ChatInputCommandInteraction) {
        // Stop the music playback & disconnect from voice
        if (this._currentChannel) {
            logger.debug(`Stopping the current music playback on VC ${this._currentChannel?.id}`)

            this._musicPlayer.clearQueue()
            this._musicPlayer.next()
        }

        interaction.editReply({ content: "Stopped music playback" })
    }

    skip(interaction: ChatInputCommandInteraction) {
        // Skip the current song
        if (this._currentChannel) {
            logger.debug(`Skipping to the next music on VC ${this._currentChannel.id}`)
            if (this._musicPlayer.hasNext()) {
                this._musicPlayer.once("playing", (info: MusicInfo) => {
                    const embed = createPlayingEmbed(info)
                    interaction.editReply({ embeds: [embed] })
                })

                this._musicPlayer.next()
            } else {
                this.stop(interaction)
            }
        } else {
            interaction.editReply({ content: "You should try playing something first :p" })
        }
    }

    getQueue(): MusicInfo[] {
        return this._musicPlayer.getQueue()
    }
}