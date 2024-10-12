const GeneratorFunction = Object.getPrototypeOf(function*() {});

GeneratorFunction.prototype.a = function() {
	console.log('fafa');
};

function* text() {
	yield 2;
}

let t = text();
t.a();
