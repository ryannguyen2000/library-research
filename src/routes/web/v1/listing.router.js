const router = require('@core/router').Publish();
const listingController = require('@controllers/client/listing');

async function getBlocks(req, res) {
	const data = await listingController.getBlocks({ ...req.query, language: req.language });
	res.sendData(data);
}

async function getListings(req, res) {
	const data = await listingController.getSellingListings({ ...req.query, language: req.language });
	res.sendData(data);
}
async function getListingsSuggestion(req, res) {
	const data = await listingController.getListingsSuggestion({ ...req.params, ...req.query, language: req.language });
	res.sendData(data);
}

async function getListingMaps(req, res) {
	const data = await listingController.getListingMaps({ ...req.query, language: req.language });
	res.sendData(data);
}

async function getListing(req, res) {
	const { listingId } = req.params;
	const listing =
		(await listingController.getListingById(listingId, { ...req.query, language: req.language })) ||
		(await listingController.getBlockByUrl(listingId, { ...req.query, language: req.language }));
	res.sendData({ listing });
}

async function getListingPrice(req, res) {
	const price = await listingController.getListingPrice(req.params.listingId, {
		...req.query,
		language: req.language,
	});
	res.sendData(price);
}

async function searchListings(req, res) {
	const data = await listingController.searchListings({ ...req.query, language: req.language });
	res.sendData(data);
}

async function getListingAvailable(req, res) {
	const data = await listingController.getListingAvailable(req.params.listingId, {
		...req.query,
		language: req.language,
	});
	res.sendData(data);
}

async function getBlock(req, res) {
	const data = await listingController.getBlockInfo(req.params.id, { ...req.query, language: req.language });
	res.sendData(data);
}

router.getS('/', getListings);
router.getS('/:slug/suggestions', getListingsSuggestion);
router.getS('/map', getListingMaps);
router.getS('/search', searchListings);
router.getS('/blocks', getBlocks);
router.getS('/blocks/:id', getBlock);

router.getS('/:listingId', getListing);
router.getS('/:listingId/available', getListingAvailable);
router.getS('/:listingId/price', getListingPrice);

module.exports = { router };
