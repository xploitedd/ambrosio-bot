import { Client, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { MusicHandlerSupplier } from "../../music/handler";
import { Command } from "../registry";

export default class SkipCommand implements Command {
    private readonly _musicHandlerSupplier: MusicHandlerSupplier

    constructor(options: { musicHandlerSupplier: MusicHandlerSupplier }) {
        this._musicHandlerSupplier = options.musicHandlerSupplier
    }

    getCommandDefinition(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName("skip")
            .setDescription("Skips the current music")
            .setDMPermission(false)
    }

    async handleCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
        const guild = interaction.guild
        if (guild === null)
            return

        await interaction.deferReply({ ephemeral: true })

        const musicHandler = this._musicHandlerSupplier(guild)
        musicHandler.skip(interaction)
    }

}