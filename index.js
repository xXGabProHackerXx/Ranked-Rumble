const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3');
const express = require('express');
const app = express();
app.use(express.json());
dotenv.config();

const db = new sqlite3.Database('./database.db');
db.serialize(() => {
	db.run('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, name TEXT NOT NULL, elo INTEGER DEFAULT 600 NOT NULL)');
});
// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.


// Log in to Discord with your client's token

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		}
		else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args, db));
	}
	else {
		client.on(event.name, (...args) => event.execute(...args, db));
	}
}

client.login(process.env.DISCORD_TOKEN);


app.get('/api/greet', (req, res) => {
	res.json({ message: 'Hello from Express!' });
});


app.get('/api/leaderboard', (req, res) => {
	const page = parseInt(req.query.page) || 10;
	const perPage = 10;
	const offset = (page - 1) * perPage;

	// Get total count for pagination
	db.get('SELECT COUNT(*) AS count FROM players', (err, countRow) => {
		if (err) {
			return res.status(500).json({ error: 'Failed to count players.' });
		}

		const totalPlayers = countRow.count;
		const totalPages = Math.ceil(totalPlayers / perPage);

		// Get leaderboard players sorted by ELO descending
		db.all(
			'SELECT name AS playerName, elo FROM players ORDER BY elo DESC LIMIT ? OFFSET ?',
			[perPage, offset],
			(err, rows) => {
				if (err) {
					return res.status(500).json({ error: 'Failed to retrieve leaderboard.' });
				}

				res.json({
					players: rows,
					totalPages,
					currentPage: page,
					perPage,
				});
			},
		);
	});
});

app.post('/create-player', (req, res) => {
	const { id, name } = req.body;
	console.log('Request received:', req.method, req.url);
	console.log('Request body:', req.body);
	if (!id || !name) {
		return res.status(400).json({ message: 'ID and name are required.' });
	}

	// Check if player already exists
	const checkQuery = 'SELECT * FROM players WHERE id = ?';
	db.get(checkQuery, [id], (err, row) => {
		if (err) {
			console.error('Error checking player:', err.message);
			return res.status(500).json({ message: 'Database query failed.' });
		}

		if (row) {
			return res.status(400).json({ message: `Player with ID ${id} already exists.` });
		}

		// Player does not exist, so create it
		const insertQuery = `
      INSERT INTO players (id, name, elo)
      VALUES (?, ?, 1000)
    `;

		db.run(insertQuery, [id, name], (err) => {
			if (err) {
				console.error('Error creating player:', err.message);
				return res.status(500).json({ message: 'Failed to create player.' });
			}

			res.status(201).json({ message: 'Player created successfully.', id, name, elo: 1000 });
		});
	});
});

app.get('/player/:id', (req, res) => {
	const playerId = req.params.id;

	// Query to get the player's elo by ID
	const query = `
    SELECT elo 
    FROM players 
    WHERE id = ?
  `;

	db.get(query, [playerId], (err, row) => {
		if (err) {
			console.error('Error fetching player elo:', err.message);
			return res.status(500).json({ message: 'Database query failed.' });
		}

		if (!row) {
			return res.status(404).json({ message: `Player with ID ${playerId} not found.` });
		}

		res.send(row.elo);
	});
});

function calculateEloChange({
	hostElo,
	clientElo,
	hostScore,
	clientScore,
	clientPing,
}) {
	const K = 34;
	const clientRoundWeight = 2.0;
	const maxPingEffect = 0.18;
	const totalRounds = hostScore + clientScore;
	if (totalRounds === 0) return { hostDelta: 0, clientDelta: 0 };

	const expectedHost = 1 / (1 + Math.pow(10, (clientElo - hostElo) / 400));

	const pingBonus = 1 + (Math.min(clientPing, 300) / 300) * maxPingEffect;
	const weightedClientScore = clientScore * clientRoundWeight * pingBonus;
	const weightedHostScore = hostScore;

	const totalWeighted = weightedHostScore + weightedClientScore;
	const finalHostScore = weightedHostScore / totalWeighted;

	const hostChange = Math.round(K * (finalHostScore - expectedHost));
	const clientChange = -hostChange;

	return { hostChange, clientChange };
}

app.post('/game-results', (req, res) => {
	const { hostid, clientid, clientping, hostscore, clientscore } = req.body;
	console.log('Request received:', req.method, req.url);
	console.log('Request body:', req.body);
	hostelo = 0;
	clientelo = 0;
	const query = `
    SELECT elo 
    FROM players 
    WHERE id = ?
  `;

	db.get(query, [hostid], (err, row) => {
		if (err) {
			console.error('Error fetching player elo:', err.message);
			return res.status(500).json({ message: 'Database query failed.' });
		}

		if (!row) {
			return res.status(404).json({ message: `Player with ID ${playerId} not found.` });
		}

		hostelo = row.elo;
	});

	db.get(query, [clientid], (err, row) => {
		if (err) {
			console.error('Error fetching player elo:', err.message);
			return res.status(500).json({ message: 'Database query failed.' });
		}

		if (!row) {
			return res.status(404).json({ message: `Player with ID ${playerId} not found.` });
		}

		clientelo = row.elo;
	});
	const result = calculateEloChange({
		hostElo: hostelo,
		clientElo: clientelo,
		hostScore: hostscore,
		clientScore: clientscore,
		clientPing: clientping,
	});

	const updateElo = db.prepare('UPDATE players SET elo = elo + ? WHERE id = ?');

	db.serialize(() => {
		updateElo.run(result.hostChange, hostid);
		updateElo.run(result.clientChange, clientid);
		updateElo.finalize(err => {
			if (err) {
				console.error(err);
				return res.status(500).json({ error: 'Failed to update ELO.' });
			}
			res.json({ message: 'ELO updated successfully.' });
		});
	});
});
app.use(express.static('public'));

// Start Server
const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
	console.log(`Server running on hehe:${PORT}`);
});