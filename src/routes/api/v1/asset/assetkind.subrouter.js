const models = require('@models');
const ThrowReturn = require('@core/throwreturn');

async function modify(req, res) {
	const { name, attributes, description } = req.body.asset_kind;
	const { id } = req.params;

	const kind = await models.AssetKind.findById(id);
	if (!kind) {
		throw new ThrowReturn(`asset_kind ${id} not found`);
	}

	if (name !== undefined) kind.name = name;
	if (attributes !== undefined) kind.attributes = attributes;
	if (description !== undefined) kind.description = description;

	const newKind = await kind.save();

	res.sendData({ kind: newKind });

	if (newKind.attributes && newKind.attributes.length) {
		const data = await models.Asset.find({ kindId: id }).select('attributes');
		data.forEach(async asset => {
			asset.name = newKind.name;
			asset.attributes = newKind.attributes.map(attribute => {
				const value = asset.attributes.find(a => a.name === attribute.name);
				return {
					...attribute.toJSON(),
					value: value ? value.value : undefined,
				};
			});
			await asset.save();
		});
	}
}

module.exports = { modify };
