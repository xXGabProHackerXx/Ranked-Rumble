let currentPage = 1;
let totalPages = 1;

function fetchLeaderboard(page) {
	fetch(`/api/leaderboard?page=${page}`)
		.then(res => res.json())
		.then(data => {
			const leaderboard = document.getElementById('leaderboard');
			leaderboard.innerHTML = '';

			data.players.forEach(player => {
				const div = document.createElement('div');
				div.className = 'player';
				div.textContent = `${player.playerName} - ELO: ${player.elo}`;
				leaderboard.appendChild(div);
			});

			currentPage = data.currentPage;
			totalPages = data.totalPages;
			document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;

			// Enable/disable buttons based on page
			document.getElementById('prevBtn').disabled = currentPage === 1;
			document.getElementById('firstBtn').disabled = currentPage === 1;
			document.getElementById('nextBtn').disabled = currentPage === totalPages;
			document.getElementById('lastBtn').disabled = currentPage === totalPages;
		})
		.catch(err => {
			console.error('Fetch error:', err);
		});
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

// Initial load
fetchLeaderboard(currentPage);