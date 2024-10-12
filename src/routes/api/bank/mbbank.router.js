const express = require('express');

const {
	verifyToken,
	generaToken,
	onReceivedTransaction,
	onReceivedTransactionResult,
} = require('@services/bank/MBBank');

const router = express.Router();

router.post('/token-generate', generaToken);
router.post('/transaction-sync', verifyToken, onReceivedTransaction);
router.post('/transaction-result', verifyToken, onReceivedTransactionResult);

module.exports = { router };
