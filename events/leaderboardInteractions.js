const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGE_SIZE = 10;

function createLeaderboardEmbed(players, page) {
	const embed = new EmbedBuilder()
		.setTitle(`Leaderboard — Page ${page}`)
		.setColor(0x00AE86)
		.setFooter({ text: 'Use the buttons below to navigate pages.' });

	if (players.length === 0) {
		embed.setDescription('No players found on this page.');
	}
	else {
		let description = '';
		players.forEach((player, index) => {
			description += `**${(page - 1) * PAGE_SIZE + index + 1}.** ${player.name} — Elo: ${player.elo}\n`;
		});
		embed.setDescription(description);
	}

	return embed;
}

function fetchLeaderboardPage(page, db) {
	return new Promise((resolve, reject) => {
		const offset = (page - 1) * PAGE_SIZE;
		const query = `
      SELECT id, name, elo
      FROM players
      ORDER BY elo DESC
      LIMIT ? OFFSET ?
    `;
		db.all(query, [PAGE_SIZE, offset], (err, rows) => {
			if (err) return reject(err);
			resolve(rows);
		});
	});
}

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction, db) {
		if (interaction.isChatInputCommand()) {
			if (interaction.commandName === 'leaderboard') {
				const page = 1;
				try {
					const players = await fetchLeaderboardPage(page, db);
					const embed = createLeaderboardEmbed(players, page);

					// Check if there are more pages
					const nextPagePlayers = await fetchLeaderboardPage(page + 1, db);

					// Create buttons
					const row = new ActionRowBuilder()
						.addComponents(
							new ButtonBuilder()
								.setCustomId('prev_page')
								.setLabel('Previous')
								.setStyle(ButtonStyle.Primary)
								// eslint-disable-next-line no-inline-comments
								.setDisabled(true), // disabled on page 1
						);

					if (nextPagePlayers.length > 0) {
						row.addComponents(
							new ButtonBuilder()
								.setCustomId('next_page')
								.setLabel('Next')
								.setStyle(ButtonStyle.Primary),
						);
					}

					await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });

				}
				catch (error) {
					console.error(error);
					await interaction.reply({ content: 'Error fetching leaderboard.', ephemeral: true });
				}
			}
		}

		else if (interaction.isButton()) {
			// Handle pagination buttons

			const embed = interaction.message.embeds[0];
			let currentPage = 1;
			if (embed && embed.title) {
				const match = embed.title.match(/Page (\d+)/);
				if (match) currentPage = parseInt(match[1]);
			}

			if (interaction.customId === 'next_page') {
				const nextPage = currentPage + 1;
				try {
					const players = await fetchLeaderboardPage(nextPage, db);
					const nextPagePlayers = await fetchLeaderboardPage(nextPage + 1, db);

					// eslint-disable-next-line no-shadow
					const embed = createLeaderboardEmbed(players, nextPage);

					// Create buttons
					const row = new ActionRowBuilder()
						.addComponents(
							new ButtonBuilder()
								.setCustomId('prev_page')
								.setLabel('Previous')
								.setStyle(ButtonStyle.Primary),
						);

					if (nextPagePlayers.length > 0) {
						row.addComponents(
							new ButtonBuilder()
								.setCustomId('next_page')
								.setLabel('Next')
								.setStyle(ButtonStyle.Primary),
						);
					}

					await interaction.update({ embeds: [embed], components: [row] });

				}
				catch (error) {
					console.error(error);
					await interaction.reply({ content: 'Error fetching next page.', ephemeral: true });
				}
			}

			else if (interaction.customId === 'prev_page') {
				if (currentPage <= 1) {
					await interaction.reply({ content: 'You are already on the first page.', ephemeral: true });
					return;
				}

				const prevPage = currentPage - 1;
				try {
					const players = await fetchLeaderboardPage(prevPage, db);

					// Check if there's a next page after the previous page
					const nextPagePlayers = await fetchLeaderboardPage(prevPage + 1, db);
					// eslint-disable-next-line no-shadow
					const embed = createLeaderboardEmbed(players, prevPage);

					// Create buttons
					const row = new ActionRowBuilder()
						.addComponents(
							new ButtonBuilder()
								.setCustomId('prev_page')
								.setLabel('Previous')
								.setStyle(ButtonStyle.Primary)
								// eslint-disable-next-line no-inline-comments
								.setDisabled(prevPage === 1), // disable if first page
						);

					if (nextPagePlayers.length > 0) {
						row.addComponents(
							new ButtonBuilder()
								.setCustomId('next_page')
								.setLabel('Next')
								.setStyle(ButtonStyle.Primary),
						);
					}

					await interaction.update({ embeds: [embed], components: [row] });

				}
				catch (error) {
					console.error(error);
					await interaction.reply({ content: 'Error fetching previous page.', ephemeral: true });
				}
			}
		}
	},
};
