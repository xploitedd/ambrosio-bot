import { ChannelType, Guild, Message, TextBasedChannel, TextChannel } from "discord.js"
import EventEmitter from "events"
import { logger } from "../app"
import { MusicInfo } from "./sources"
import { createPlayingEmbed, createQueueEmbed } from "./util"

const TEXT_CHANNEL_NAME = "ambrosio-music"

export default class TextChannelManager extends EventEmitter {
    private readonly _guild: Guild
    private _setupPromise: Promise<void>

    private _textChannel?: TextChannel
    private _queueMessage?: string
    private _playingMessage?: string

    constructor(options: { guild: Guild }) {
        super()

        this._guild = options.guild
        this._setupPromise = this._setupTextChannel()
    }

    private async _getQueueMessage(): Promise<Message> {
        if (this._queueMessage === null || this._textChannel === null)
            await this._setupPromise

        const channel = this._textChannel as TextChannel
        const msgId = this._queueMessage as string

        return channel.messages.fetch(msgId)
    }

    private async _getPlayingMessage(): Promise<Message> {
        if (this._playingMessage === null || this._textChannel === null)
            await this._setupPromise

        const channel = this._textChannel as TextChannel
        const msgId = this._playingMessage as string

        return channel.messages.fetch(msgId)
    }

    private async _setupMessages() {
        if (!this._textChannel)
            return

        const channel = this._textChannel
        const client = channel.client

        const messages = await this._textChannel.messages.fetch({ cache: false })
            .then(it => it.filter(msg => msg.author.id === client.user?.id))
            .then(it => it.filter(msg => msg.interaction === null))
            .then(it => it.map(msg => msg))

        if (messages.length < 2) {
            if (messages.length < 1) {
                this._queueMessage = await channel.send({ embeds: [createQueueEmbed([])] })
                    .then(it => it.id)
            }

            this._playingMessage = await channel.send({ embeds: [createPlayingEmbed()] })
                .then(it => it.id)
        } else {
            this._queueMessage = messages[1].id
            this._playingMessage = messages[0].id
        }
    }

    private async _setupTextChannel() {
        try {
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

            this._textChannel.client.on("messageCreate", async message => {
                if (message.channel.type === ChannelType.GuildText && message.channelId === this._textChannel?.id) {
                    this.emit("new_query", message.content, message)

                    try {
                        await message.delete()
                    } catch (e) {
                        logger.error(`Error deleting message ${message.id}: ${e}`)
                    }
                }
            })

            await this._setupMessages()
        } catch (e) {
            logger.error(`Error setting up music text channels for guild ${this._guild.id}: ${e}`)
        }
    }

    async setPlaying(info?: MusicInfo) {
        if (!this._playingMessage)
            await this._setupPromise

        const msg = await this._getPlayingMessage()
        await msg.edit({ embeds: [createPlayingEmbed(info)] })
    }

    async setQueue(queue: MusicInfo[]) {
        if (!this._queueMessage)
            await this._setupPromise

        const msg = await this._getQueueMessage()
        await msg.edit({ embeds: [createQueueEmbed(queue)] })
    }

    async isBotChannel(channel: TextBasedChannel): Promise<boolean> {
        await this._setupPromise
        return this._textChannel?.id === channel.id
    }
}