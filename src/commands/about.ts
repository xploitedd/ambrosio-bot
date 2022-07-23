import { Client, ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Command } from "./registry";

export default class AboutCommand implements Command {
    getCommandDefinition(): SlashCommandBuilder {
        return new SlashCommandBuilder()
            .setName("about")
            .setDescription("Learn more about this bot") as SlashCommandBuilder
    }

    async handleCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void> {
        await interaction.deferReply({ ephemeral: true })

        const user = client.user
        if (!user) {
            await interaction.editReply({ content: "Error fetching bot user..." })
            return
        }

        const date = new Date().toUTCString()
        const embed = new EmbedBuilder()
            .setTitle(`About ${user.username}`)
            .setThumbnail(user.avatarURL({ size: 128 }) ?? null)
            .addFields([
                { name: "What can I do?", value: "A lot of things :)" }
            ])
            .setFooter({ text: `Generated on ${date}` })
            .toJSON()

        await interaction.editReply({ embeds: [embed] })
    }
}