const LOCAL_URL = '';
const SERVER_URL = 'https://api.cozrum.com/web/v1/locker';
const DELAY_RETRY = 10000;

function request(endPoint, options = {}) {
	return axios.get(`${LOCAL_URL}/${endPoint}`, options);
}

function sendbackToServer(data) {
	return axios.post(`${SERVER_URL}/callback`, data);
}

function getRequestByCommand(data) {
	try {
		data = JSON.parse(data);
		if (!data.command) return;

		request(data.command)
			.then(response => {
				sendbackToServer({
					data,
					response,
				});
			})
			.catch(e => {
				sendbackToServer({
					data,
					response: e,
				});
			});
	} catch (e) {
		console.error(e);
	}
}

(function initSSE() {
	const source = new EventSource(`${SERVER_URL}/events`);

	source.onopen = e => {
		console.log('connected to server!');
	};

	source.onerror = e => {
		console.error(e);
		source.close();
		setTimeout(initSSE, DELAY_RETRY);
	};

	source.onmessage = e => {
		getRequestByCommand(e.data);
	};
})();
