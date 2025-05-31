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

app.post('/upsert-data', (req, res) => {
	res.send(req.body);
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

function calculateEloChange({ hostElo, clientElo, hostScore, clientScore, clientPing }) {
	const baseK = 32;

	// Expected scores by classic ELO
	const baseExpectedHost = 1 / (1 + Math.pow(10, (clientElo - hostElo) / 400));
	const baseExpectedClient = 1 - baseExpectedHost;

	// Ping ratio capped at 1 (300 ms max)
	const pingRatio = Math.min(clientPing / 300, 1);

	// Client round weight boosted by ping (1 to 2)
	const clientRoundWeight = 1 + pingRatio;

	// Weighted actual scores
	const totalWeightedRounds = (hostScore * 1) + (clientScore * clientRoundWeight);
	const hostActual = (hostScore * 1) / totalWeightedRounds;
	const clientActual = (clientScore * clientRoundWeight) / totalWeightedRounds;

	// Adjust expected client score by a small factor (max -0.05)
	const expectedClient = baseExpectedClient - 0.05 * pingRatio;
	const expectedHost = 1 - expectedClient;

	// Calculate raw deltas
	let clientDelta = baseK * (clientActual - expectedClient);
	let hostDelta = baseK * (hostActual - expectedHost);

	// Soften client loss penalties at high ping (reduce loss magnitude)
	if (clientDelta < 0) {
		// eslint-disable-next-line no-inline-comments
		const softeningFactor = 0.5 + 0.5 * (1 - pingRatio); // from 1 at 0 ping to 0.5 at 300 ping
		clientDelta *= softeningFactor;
	}

	// Clip deltas to ±baseK (32) to avoid extreme swings
	clientDelta = Math.max(-baseK, Math.min(baseK, clientDelta));
	hostDelta = Math.max(-baseK, Math.min(baseK, hostDelta));

	// Ensure zero-sum by balancing rounding error
	const totalDelta = clientDelta + hostDelta;
	if (totalDelta !== 0) {
		// Distribute difference proportionally to keep sum zero
		const clientRatio = Math.abs(clientDelta) / (Math.abs(clientDelta) + Math.abs(hostDelta));
		clientDelta -= totalDelta * clientRatio;
		hostDelta -= totalDelta * (1 - clientRatio);
	}

	return {
		hostChange: Math.round(hostDelta),
		clientChange: Math.round(clientDelta),
	};
}

const testResult = calculateEloChange({
	hostElo: 1400,
	clientElo: 1400,
	hostScore: 0,
	clientScore: 2,
	clientPing: 100,
});

console.log('Host ELO Change:', testResult.hostChange);
console.log('Client ELO Change:', testResult.clientChange);

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

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running on hehe:${PORT}`);
});