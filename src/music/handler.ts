import { entersState, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import { ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, Guild, TextChannel, VoiceChannel } from "discord.js";
import { logger } from "../app";
import MusicPlayer from "./player";
import { MusicInfo } from "./sources";

const TEXT_CHANNEL_NAME = "ambrosio-music"

export type MusicHandlerSupplier = (guild: Guild) => MusicHandler

export default class MusicHandler {
    private _discordClient: Client
    private _guild: Guild
    private _musicPlayer: MusicPlayer

    private _textChannel?: TextChannel
    private _currentChannel?: VoiceChannel

    constructor(discordClient: Client, guild: Guild, musicPlayer: MusicPlayer) {
        this._discordClient = discordClient
        this._guild = guild
        this._musicPlayer = musicPlayer

        this._setupTextChannel()
    }

    private async _setupTextChannel() {
        const channels = await this._guild.channels.fetch()
        this._textChannel = channels.find(value =>
            value.type === ChannelType.GuildText && value.name === TEXT_CHANNEL_NAME
        ) as TextChannel | undefined

        if (!this._textChannel) {
            this._textChannel = await this._guild.channels.create({
                name: TEXT_CHANNEL_NAME,
                type: ChannelType.GuildText
            })
        }
    }

    async play(query: string, voiceChannel: VoiceChannel, interaction: ChatInputCommandInteraction) {
        let conn: VoiceConnection | null = null
        try {
            logger.debug(`Received music query "${query}" from ${interaction.user.id} in guild ${voiceChannel.guildId}`)

            if (this._currentChannel) {
                if (this._currentChannel.id === voiceChannel.id) {
                    this._musicPlayer.once("queued", (info: MusicInfo) => {
                        logger.info(`A music has been queued (${info.title}) on voice channel ${voiceChannel.id} of guild ${voiceChannel.guildId}`)
                        interaction.editReply({ content: `Added to the queue: ${info.title}` })
                    })
    
                    if (!await this._musicPlayer.play(query))
                        interaction.editReply({ content: "Unfortunately we cannot play this music. Maybe try another one?" })
                } else {
                    // bot is busy in this guild
                    logger.debug(`Bot is busy in another VC. Requested: ${voiceChannel.id}, Current: ${this._currentChannel.id}`)
                    interaction.editReply({ content: "I'm currently busy playing songs in another channel!" })
                }
    
                return
            }
    
            this._currentChannel = voiceChannel
    
            conn = joinVoiceChannel({
                guildId: this._guild.id,
                channelId: voiceChannel.id,
                adapterCreator: this._guild.voiceAdapterCreator
            })

            await entersState(conn, VoiceConnectionStatus.Ready, 5_000)
            const sub = this._musicPlayer.subscribe(conn)
            if (!sub)
                throw new Error("Error creating player subscription")

            this._musicPlayer.once("playing", (info: MusicInfo) => {
                logger.info(`Player has started playing on VC ${voiceChannel.id}. Song: ${info.title}`)

                const embed = _createPlayingEmbed(info)
                interaction.editReply({ embeds: [embed] })
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
                interaction.editReply({ content: "Unfortunately we cannot play this music. Maybe try another one?" })
        } catch (e) {
            interaction.editReply({ content: "An unexpected error has occurred while trying to play a music" })
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

        interaction.deleteReply()
    }

    skip(interaction: ChatInputCommandInteraction) {
        // Skip the current song
        if (this._currentChannel) {
            logger.debug(`Skipping to the next music on VC ${this._currentChannel.id}`)
            if (this._musicPlayer.hasNext()) {
                this._musicPlayer.once("playing", (info: MusicInfo) => {
                    const embed = _createPlayingEmbed(info)
                    interaction.editReply({ embeds: [embed] })
                })
            } else {
                interaction.deleteReply()
            }

            this._musicPlayer.next()
        } else {
            interaction.deleteReply()
        }
    }

    getQueue() {
        // Get the current song queue
    }
}

function _createPlayingEmbed(playing: MusicInfo): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("Now Playing")
        .setDescription(playing.title)
        .setURL(playing.url)
        .setThumbnail(playing.thumbnail)
        .setAuthor({
            name: playing.author.name,
            iconURL: playing.author.photo
        })
        .setTimestamp(Date.now())
}