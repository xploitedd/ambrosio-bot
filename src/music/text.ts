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
    private _messageId?: string

    constructor(options: { guild: Guild }) {
        super()

        this._guild = options.guild
        this._setupPromise = this._setupTextChannel()
    }

    private async _getMessage(): Promise<Message> {
        await this._setupPromise
        const channel = this._textChannel as TextChannel
        const msgId = this._messageId as string

        return channel.messages.fetch(msgId)
    }

    private async _setupMessages() {
        if (!this._textChannel)
            return

        const channel = this._textChannel
        const client = channel.client

        const messages = await this._textChannel.messages.fetch()
            .then(it => it.filter(msg => msg.author.id === client.user?.id))
            .then(it => it.filter(msg => msg.interaction === null))
            .then(it => it.map(msg => msg))

        if (messages.length === 0) {
            this._messageId = await channel.send({ embeds: [createQueueEmbed([]), createPlayingEmbed()] })
                .then(it => it.id)

            return
        }

        this._messageId = messages[0].id
        this.setMessage()
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
                    if (message.interaction !== null)
                        return

                    logger.debug(`Received music query on channel ${this._textChannel.id}: ${message.content}`)

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

    async setMessage(playing?: MusicInfo, queue?: MusicInfo[]) {
        const msg = await this._getMessage()
        await msg.edit({ embeds: [createQueueEmbed(queue ?? []), createPlayingEmbed(playing)] })
    }

    async isBotChannel(channel: TextBasedChannel): Promise<boolean> {
        await this._setupPromise
        return this._textChannel?.id === channel.id
    }
}