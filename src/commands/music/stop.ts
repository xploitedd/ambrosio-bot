import { ChatInputCommandInteraction, Client, PermissionsBitField, SlashCommandBuilder } from "discord.js";
import { MusicHandlerSupplier } from "../../music/handler";
import { Command } from "../registry";

export default class StopCommand implements Command {
    private readonly _musicHandlerSupplier: MusicHandlerSupplier

    constructor(options: { musicHandlerSupplier: MusicHandlerSupplier }) {
        this._musicHandlerSupplier = options.musicHandlerSupplier
    }

    getCommandDefinition(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName("stop")
            .setDescription("Stops the current music playback")
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels)
    }

    async handleCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
        const guild = interaction.guild
        if (guild === null)
            return

        await interaction.deferReply()

        const musicHandler = this._musicHandlerSupplier(guild)
        musicHandler.stop(interaction)
    }
}