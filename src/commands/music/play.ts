import { Client, ChatInputCommandInteraction, SlashCommandBuilder, PermissionsBitField, GuildMember, ChannelType } from "discord.js";
import { MusicHandlerSupplier } from "../../music/handler";
import { Command } from "../registry";

export default class PlayCommand implements Command {
    private readonly _musicHandlerSupplier: MusicHandlerSupplier

    constructor(musicHandlerSupplier: MusicHandlerSupplier) {
        this._musicHandlerSupplier = musicHandlerSupplier
    }

    getCommandDefinition(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName("play")
            .setDescription("Play a new music")
            .addStringOption(option =>
                option
                    .setName("query")
                    .setDescription("The url or name of the music you want to play")
                    .setRequired(true)
            )
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels) as SlashCommandBuilder
    }

    async handleCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
        const guild = interaction.guild
        if (guild === null)
            return

        const member = interaction.member
        if (member === null)
            return

        await interaction.deferReply({ ephemeral: true })

        const guildMember = member as GuildMember
        const voiceChannel = guildMember.voice.channel

        if (voiceChannel === null || voiceChannel.type !== ChannelType.GuildVoice) {
            await interaction.editReply({ content: "You must be in a voice channel to be able to execute this command" })
            return
        }

        const query = interaction.options.getString("query", true)
        const musicHandler = this._musicHandlerSupplier(guild)
        musicHandler.play(query, voiceChannel, interaction)
    }
}