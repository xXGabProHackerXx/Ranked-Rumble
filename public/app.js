let currentPage = 1;
let totalPages = 1;

function fetchLeaderboard(page) {
	fetch(`/api/leaderboard?page=${page}`)
		.then(res => res.json())
		.then(data => {
			makeLeaderboard(data);
		})
		.catch(err => {
			console.error('Fetch error:', err);
		});
}

function makeLeaderboard(data) {
	currentPage = data.currentPage;
	totalPages = data.totalPages;

	const leaderboard = document.getElementById('leaderboardtable');
	leaderboard.innerHTML = '';

	const headRow = document.createElement('tr');

	const placementHead = document.createElement('th');
	placementHead.className = 'playerPlacement';
	placementHead.textContent = 'Placement';
	headRow.appendChild(placementHead);

	const usernameHead = document.createElement('th');
	usernameHead.className = 'playerUsername';
	usernameHead.textContent = 'Username';
	headRow.appendChild(usernameHead);

	const eloHead = document.createElement('th');
	eloHead.className = 'playerELO';
	eloHead.textContent = 'Elo';
	headRow.appendChild(eloHead);

	leaderboard.appendChild(headRow);

	let index = 0;
	data.players.forEach(player => {
		const playerRow = document.createElement('tr');
		playerRow.className = 'player';

		const playerPlacement = document.createElement('td');
		playerPlacement.className = 'playerPlacement';
		playerPlacement.textContent = (currentPage - 1) * data.perPage + index + 1 + '.';
		playerRow.appendChild(playerPlacement);

		const playerUsername = document.createElement('td');
		playerUsername.className = 'playerUsername';
		playerUsername.textContent = player.playerName;
		playerRow.appendChild(playerUsername);

		const playerELO = document.createElement('td');
		playerELO.className = 'playerELO';
		playerELO.textContent = player.elo;
		playerRow.appendChild(playerELO);

		leaderboard.appendChild(playerRow);
		index++;
	});


	// Update input + total page display
	const pageInput = document.getElementById('pageInput');
	const totalDisplay = document.getElementById('totalPagesDisplay');

	pageInput.value = currentPage;
	totalDisplay.textContent = totalPages;

	// Enable/disable buttons
	document.getElementById('prevBtn').disabled = currentPage === 1;
	document.getElementById('firstBtn').disabled = currentPage === 1;
	document.getElementById('nextBtn').disabled = currentPage === totalPages;
	document.getElementById('lastBtn').disabled = currentPage === totalPages;
}

document.getElementById('firstBtn').addEventListener('click', () => {
	if (currentPage !== 1) fetchLeaderboard(1);
});

document.getElementById('prevBtn').addEventListener('click', () => {
	if (currentPage > 1) fetchLeaderboard(currentPage - 1);
});

document.getElementById('nextBtn').addEventListener('click', () => {
	if (currentPage < totalPages) fetchLeaderboard(currentPage + 1);
});

document.getElementById('lastBtn').addEventListener('click', () => {
	if (currentPage !== totalPages) fetchLeaderboard(totalPages);
});

document.getElementById('pageInput').addEventListener('keypress', e => {
	if (e.key === 'Enter') {
		const desiredPage = parseInt(e.target.value);
		if (!isNaN(desiredPage) && desiredPage >= 1 && desiredPage <= totalPages) {
			fetchLeaderboard(desiredPage);
		}
		else {
			alert(`Please enter a valid page number between 1 and ${totalPages}.`);
			e.target.value = currentPage;
		}
	}
});

// Initial load
fetchLeaderboard(currentPage);