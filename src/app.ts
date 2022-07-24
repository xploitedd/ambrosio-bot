import { Client, GatewayIntentBits } from "discord.js"
import { REST } from "@discordjs/rest"
import CommandRegistry from "./commands/registry"
import MusicHandler, { MusicHandlerSupplier } from "./music/handler"
import AboutCommand from "./commands/about"
import PlayCommand from "./commands/music/play"
import SkipCommand from "./commands/music/skip"
import PlayerSourceRegistry from "./music/sources"
import YoutubePlayerSource from "./music/youtube/youtubeVideoSource"
import MusicPlayer from "./music/player"
import { createAudioPlayer, createAudioResource, demuxProbe } from "@discordjs/voice"
import winston from "winston"
import { google } from "googleapis"
import YoutubePlaylistSource from "./music/youtube/youtubePlaylistSource"
import YoutubeTextSource from "./music/youtube/youtubeTextSource"
import StopCommand from "./commands/music/stop"

const loggingLevel = process.env.LOG_LEVEL || "info"

export const logger = winston.createLogger({
    level: loggingLevel,
    transports: [
        new winston.transports.Console({ 
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.colorize({ all: true })
            )
        })
    ]
})

const discordToken = process.env.DISCORD_TOKEN

if (discordToken == undefined) {
    logger.error("Please define the DISCORD_TOKEN environment variable")
    process.exit(1)
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.MessageContent
    ] 
})

const playerSourceRegistry = new PlayerSourceRegistry()
    .addSource(new YoutubePlayerSource())

const YOUTUBE_TOKEN = process.env.YOUTUBE_TOKEN
if (YOUTUBE_TOKEN) {
    const youtube = google.youtube({
        version: "v3",
        auth: YOUTUBE_TOKEN
    })

    playerSourceRegistry.addSource(new YoutubePlaylistSource({ youtube }))
        .setFallback(new YoutubeTextSource({ youtube }))
} else {
    logger.warn("Define the YOUTUBE_TOKEN in your environment variable to enable more player sources")
}

const musicCache: { [key: string]: MusicHandler } = {}
const musicHandlerSupplier: MusicHandlerSupplier = guild => {
    const existingHandler = musicCache[guild.id]
    if (existingHandler)
        return existingHandler

    const musicPlayer = new MusicPlayer(
        playerSourceRegistry,
        () => createAudioPlayer(),
        async stream => {
            const { type } = await demuxProbe(stream)
            return createAudioResource(stream, { inputType: type })
        }
    )

    const newHandler = new MusicHandler(client, guild, musicPlayer)
    musicCache[guild.id] = newHandler
    return newHandler
}

const rest = new REST().setToken(discordToken)

const commandRegistry = new CommandRegistry(client, rest)
    .addCommand(new AboutCommand())
    .addCommand(new PlayCommand({ musicHandlerSupplier }))
    .addCommand(new SkipCommand({ musicHandlerSupplier }))
    .addCommand(new StopCommand({ musicHandlerSupplier }))

client.on("ready", async () => {
    try {
        logger.info(`Client is now ready: ${client.user?.username}`)
        await commandRegistry.registerCommands()
        commandRegistry.registerInteractionListener()
    } catch (e) {
        console.error(e)
        process.exit(1)
    }
})

// client.on("voiceStateUpdate", async (oldState, newState) => {
//     const time = Date.now()
//     const member = oldState.member
//     if (member == null || member.user.bot)
//         return

//     if (!member.permissions.has(PermissionsBitField.Flags.Administrator, true))
//         return

//     if (oldState.channelId == null)
//         return

//     if (oldState.channelId != newState.channelId) {
//         // The user has moved voice channels
//         // We need to find the audit log entry to check whether someone moved the user or not

//         console.log(`User ${member.user.username} moved from ${oldState.channel?.name} to ${newState.channel?.name ?? "disconnected state"}`)
        
//         const guild = oldState.guild
//         const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 3 })

//         const target = logs.entries
//             .filter(entry => entry.executor?.id !== member.user.id)
//             .filter(entry => entry.createdTimestamp >= time - 3_000 || entry.changes.length > 1)
//             .first()
//             ?.executor ?? null

//         // No target found, it was a legitimate move
//         if (target == null) {
//             console.log("No target found")
//             return
//         }

//         if (target.bot) {
//             console.log("Target is a bot")
//             return
//         }

//         console.log(`Found target user to move: ${target.username}`)

//         // Move user back to old channel
//         if (newState.member?.voice.channelId) {
//             await newState.member.voice.setChannel(oldState.channel)
//         }

//         // Move target to afk or disconnect
//         const targetMember = await oldState.guild.members.fetch({ user: target })
//         if (targetMember.voice.channelId) {
//             const afkChannel = guild.afkChannel
//             if (afkChannel)
//                 await targetMember.voice.setChannel(afkChannel)
//             else
//                 await targetMember.voice.disconnect()
//         }
//     }
// })

client.login(discordToken)