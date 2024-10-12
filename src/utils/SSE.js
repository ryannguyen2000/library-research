// const { logger } = require('./logger');

function SSE({ intervalPing = true, intervalPingTime = 15000 } = {}) {
	this.eventsList = [];
	this.usersList = [];

	this.addEvent = function (data) {
		this.eventsList.push(data);
		this.pushEventToClient();
	};

	this.getUsers = function () {
		return this.usersList.length;
	};

	this.addUser = function (req, res) {
		res.set({
			'Cache-Control': 'no-cache',
			'Content-Type': 'text/event-stream',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		});
		res.flushHeaders();

		res.on('close', () => {
			const index = this.usersList.findIndex(u => u === res);
			this.usersList.splice(index, 1);
			res.end();
		});

		this.usersList.push(res);
	};

	this.pushEventToClient = function () {
		while (this.eventsList[0]) {
			const response = `data: ${JSON.stringify(this.eventsList[0])}\n\n`;
			this.eventsList.splice(0, 1);

			this.usersList.forEach(res => {
				res.write(response);
				res.flush();
			});
		}
	};

	if (intervalPing) {
		setInterval(() => {
			this.addEvent({
				event: 'ping',
			});
		}, intervalPingTime);
	}
}

module.exports = { SSE };
