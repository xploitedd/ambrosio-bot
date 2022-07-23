import { REST } from "@discordjs/rest";
import { ChatInputCommandInteraction, Client, Routes, SlashCommandBuilder } from "discord.js";

export interface Command {
    getCommandDefinition(): SlashCommandBuilder
    handleCommand(client: Client, interaction: ChatInputCommandInteraction): Promise<void>
}

export default class CommandRegistry {
    private readonly _discordClient: Client
    private readonly _discordRestClient: REST
    private _commands: { [key: string]: Command } = {}
    
    constructor(discordClient: Client, discordRestClient: REST) {
        this._discordClient = discordClient
        this._discordRestClient = discordRestClient
    }

    addCommand(command: Command): CommandRegistry {
        const definition = command.getCommandDefinition()
        this._commands[definition.name] = command
        return this
    }

    async registerCommands(): Promise<void> {
        // send commands to discord api
        const commands = Object.values(this._commands)
            .map(it => it.getCommandDefinition().toJSON())

        const app = this._discordClient.application
        if (!app)
            return
        
        await this._discordRestClient.put(
            Routes.applicationCommands(app.id),
            { body: commands }
        )
    }

    registerInteractionListener() {
        this._discordClient.on("interactionCreate", async interaction => {
            if (!interaction.isChatInputCommand())
                return

            const command = this._commands[interaction.commandName]
            if (!command)
                return

            try {
                await command.handleCommand(this._discordClient, interaction)
            } catch (e) {
                const content = "An error occurred while executing this command"
                if (interaction.deferred || interaction.replied) {
                    interaction.editReply({ content })
                } else {
                    interaction.reply({ content, ephemeral: true })
                }

                console.error(e)
            }
        })
    }
}