import { ChannelType, Guild, Message, TextChannel } from "discord.js"
import EventEmitter from "events"
import { logger } from "../app"
import { MusicInfo } from "./sources"
import { createPlayingEmbed, createQueueEmbed } from "./util"

const TEXT_CHANNEL_NAME = "ambrosio-music"

export default class TextChannelManager extends EventEmitter {
    private readonly _guild: Guild
    private _setupPromise: Promise<void>

    private _textChannel?: TextChannel
    private _queueMessage?: Message
    private _playingMessage?: Message

    constructor(options: { guild: Guild }) {
        super()

        this._guild = options.guild
        this._setupPromise = this._setupTextChannel()
    }

    private async _setupMessages() {
        if (!this._textChannel)
            return

        const channel = this._textChannel
        const client = channel.client

        const messages = await this._textChannel.messages.fetch({ cache: false })
            .then(it => it.filter(msg => msg.author.id === client.user?.id))
            .then(it => it.map(msg => msg))

        if (messages.length < 2) {
            if (messages.length < 1)
                this._queueMessage = await channel.send({ embeds: [createQueueEmbed([]) ]})

            this._playingMessage = await channel.send({ embeds: [createPlayingEmbed() ]})
        } else {
            this._queueMessage = messages[1]
            this._playingMessage = messages[0]
        }
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
    }

    async setPlaying(info?: MusicInfo) {
        if (!this._playingMessage)
            await this._setupPromise

        const msg = this._playingMessage as Message
        await msg.edit({ embeds: [ createPlayingEmbed(info) ] })
    }

    async setQueue(queue: MusicInfo[]) {
        if (!this._queueMessage)
            await this._setupPromise

        const msg = this._queueMessage as Message
        await msg.edit({ embeds: [ createQueueEmbed(queue) ] })
    }

}