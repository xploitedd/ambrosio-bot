import { AudioPlayerStatus, entersState, joinVoiceChannel, VoiceConnectionStatus } from "@discordjs/voice";
import { ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, Guild, TextChannel, VoiceChannel } from "discord.js";
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
        if (this._currentChannel) {
            if (this._currentChannel.id === voiceChannel.id) {
                this._musicPlayer.once("queued", (info: MusicInfo) => {
                    interaction.editReply({ content: `Added to the queue: ${info.title}` })
                })

                this._musicPlayer.play(query)
            } else {
                // bot is busy in this guild
                interaction.editReply({ content: "I'm currently busy playing songs in another channel!" })
            }

            return
        }

        this._currentChannel = voiceChannel

        const conn = joinVoiceChannel({
            guildId: this._guild.id,
            channelId: voiceChannel.id,
            adapterCreator: this._guild.voiceAdapterCreator
        })

        try {
            await entersState(conn, VoiceConnectionStatus.Ready, 5_000)
            const sub = this._musicPlayer.subscribe(conn)
            if (!sub)
                throw new Error("Error creating player subscription")

            this._musicPlayer.once("playing", (info: MusicInfo) => {
                const embed = _createPlayingEmbed(info)
                interaction.editReply({ embeds: [embed] })
            })

            this._musicPlayer.on("end", () => {
                sub.unsubscribe()
                conn.destroy()
                this._musicPlayer.removeAllListeners()
                this._currentChannel = undefined
            })

            this._musicPlayer.play(query)
        } catch (e) {
            conn.destroy()
            console.error(e)

            this._currentChannel = undefined
        }
    }

    stop(interaction: ChatInputCommandInteraction) {
        // Stop the music playback & disconnect from voice
        this._musicPlayer.clearQueue()
        this._musicPlayer.next()

        interaction.deleteReply()
    }

    skip(interaction: ChatInputCommandInteraction) {
        // Skip the current song
        this._musicPlayer.next()
        interaction.deleteReply()
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