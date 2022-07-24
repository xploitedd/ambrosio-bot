import { EmbedBuilder } from "discord.js";
import { MusicInfo } from "./sources";

export function createPlayingEmbed(playing?: MusicInfo): EmbedBuilder {
    if (!playing) {
        return new EmbedBuilder()
            .setTitle("No music currently playing")
    }

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

export function createQueueEmbed(queue: MusicInfo[]): EmbedBuilder {
    const count = queue.length
    if (count === 0) {
        return new EmbedBuilder()
            .setTitle("There are no items in the queue")
            .setDescription("Add some items to get the party started")
    }

    const sliced = queue.slice(0, 20)
    return new EmbedBuilder()
        .setTitle(`${count} item(s) in the queue`)
        .addFields(sliced.map((it, idx) => ({
            name: `#${idx + 1} ${it.title}`,
            value: it.url
        })))
        .setFooter({
            text: `${count > 20 ? count - 20 : 0} music(s) are hidden in this view`
        })
}