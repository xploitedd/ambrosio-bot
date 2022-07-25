import { entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { ChannelType, ChatInputCommandInteraction, Client, Guild, GuildMember, Message, MessagePayload, VoiceChannel, WebhookEditMessageOptions } from "discord.js";
import { logger } from "../app";
import MusicPlayer from "./player";
import { MusicInfo } from "./sources";
import TextChannelManager from "./text";
import { createPlayingEmbed } from "./util";

type MessageReply = string | MessagePayload | WebhookEditMessageOptions

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

    private async _respondToInteraction(response: MessageReply, interaction?: ChatInputCommandInteraction) {
        if (!interaction)
            return null

        const channel = interaction.channel
        if (channel === null)
            return

        if (await this._textManager.isBotChannel(channel))
            await interaction.deleteReply()
        else
            await interaction.editReply(response)
    }

    async play(query: string, voiceChannel: VoiceChannel, interaction?: ChatInputCommandInteraction) {
        let conn: VoiceConnection | null = null
        try {
            logger.debug(`Received music query "${query}" in guild ${voiceChannel.guildId}`)

            if (this._currentChannel) {
                if (this._currentChannel.id === voiceChannel.id) {
                    this._musicPlayer.once("queued", (info: MusicInfo) => {
                        logger.info(`A music has been queued (${info.title}) on voice channel ${voiceChannel.id} of guild ${voiceChannel.guildId}`)
                        this._respondToInteraction({ content: `Added to the queue: ${info.title}` }, interaction)
                            .catch(e => logger.error(`Error responding to queued interaction: ${e}`))
                    })

                    if (!await this._musicPlayer.play(query))
                        await interaction?.editReply({ content: "Unfortunately we cannot play this music. Maybe try another one?" })
                } else {
                    // bot is busy in this guild
                    logger.debug(`Bot is busy in another VC. Requested: ${voiceChannel.id}, Current: ${this._currentChannel.id}`)
                    await interaction?.editReply({ content: "I'm currently busy playing songs in another channel!" })
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
                this._respondToInteraction({ embeds: [embed] }, interaction)
                    .catch(e => logger.error(`Error responding to play interaction: ${e}`))
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
                await interaction?.editReply({ content: "Unfortunately we cannot play this music. Maybe try another one?" })
        } catch (e) {
            interaction?.editReply({ content: "An unexpected error has occurred while trying to play a music" })
                .catch(e => logger.error(`Error sending interaction: ${e}`))

            logger.error(`An error occurred, destroying voice connection on ${voiceChannel.id}. ${e}`)
            if (conn !== null)
                conn.destroy()

            this._currentChannel = undefined
        }
    }

    async stop(interaction?: ChatInputCommandInteraction) {
        try {
            // Stop the music playback & disconnect from voice
            if (this._currentChannel) {
                logger.debug(`Stopping the current music playback on VC ${this._currentChannel?.id}`)

                this._musicPlayer.clearQueue()
                this._musicPlayer.next()

                await this._respondToInteraction({ content: "Stopped music playback" }, interaction)
            } else {
                await this._respondToInteraction({ content: "Cannot stop a bunch of nothingness :p" }, interaction)
            }
        } catch (e) {
            logger.error(`An error occurred while stopping a music player: ${e}`)
        }
    }

    async skip(interaction?: ChatInputCommandInteraction) {
        try {
            // Skip the current song
            if (this._currentChannel) {
                logger.debug(`Skipping to the next music on VC ${this._currentChannel.id}`)
                if (this._musicPlayer.hasNext()) {
                    this._musicPlayer.once("playing", (info: MusicInfo) => {
                        const embed = createPlayingEmbed(info)
                        this._respondToInteraction({ embeds: [embed] }, interaction)
                            .catch(e => logger.error(`Error responding to skip interaction: ${e}`))
                    })

                    this._musicPlayer.next()
                } else {
                    this.stop(interaction)
                }
            } else {
                await this._respondToInteraction({ content: "You should try playing something first :p" }, interaction)
            }
        } catch (e) {
            logger.error(`An error occurred while skipping a music player: ${e}`)
        }
    }

    async shuffle(interaction?: ChatInputCommandInteraction) {
        try {
            if (this._currentChannel) {
                logger.debug(`Shuffling music queue in VC ${this._currentChannel.id}`)
                this._musicPlayer.shuffleQueue()
                if (this._musicPlayer.hasNext())
                    await this._respondToInteraction({ content: "You just shuffled a bunch of musics. Well done DJ!" }, interaction)
                else
                    await interaction?.deleteReply()
            } else {
                await this._respondToInteraction({ content: "There are no items for you to shuffle! Try adding more musics..." }, interaction)
            }
        } catch (e) {
            logger.error(`An error occurred while shuffling a music player: ${e}`)
        }
    }

    getQueue(): MusicInfo[] {
        return this._musicPlayer.getQueue()
    }
}
