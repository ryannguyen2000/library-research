require('./array.ext');

let winners = [19];
let chunk = winners.chunk(50);
console.log(chunk);

// options = {
// 	'option1':'cau1',
// 	'option2':'cau2',
// 	'option3':'cau3',
// }

// keys = Object.keys(options);

// Array.permutations()

// function *gen_number(){
// 	for(let i = 0; ;i++)yield i;
// }

// function *gen_even(){
// 	for(let i = 0; ;i++)yield i*2;
// }

// function *gen_odd(){
// 	for(let i = 0; ;i++)yield i*2+1;
// }

// function *gen_fibonacci(){
// 	let a = 1, b=1;
// 	while(true){
// 		[a,b] = [b,a+b];
// 		yield a;
// 	}
// }

// function test_Generator(){
// 	console.log('\n\ntest_Generator');
// 	let number = Array.iterable(gen_fibonacci());

// 	let odd = number.ifilter(i=>i%2);
// 	let even = number.ifilter(i=>!(i%2));

// 	odd
// 		.imap(c=>({fibonacci:c}))
// 		.itakeWhile((_c,i)=>i<10)
// 		.imap(c=>({fibonacci:c}))
// 		.forEach(o=>console.log('odd',o));

// 	even
// 		.itakeWhile((_c,i)=>i<10)
// 		.forEach(o=>console.log('even',o));
// }

// function test_Generator2(){
// 	console.log('\n\ntest_Generator2');
// 	let array = [1,2,3,4];
// 	let iterable = Array.iterable(array);
// 	for(let c of iterable){
// 		console.log(c);
// 		break;
// 	}
// 	for(let c of iterable){
// 		console.log(c);
// 	}

// 	for(let c of array){
// 		console.log(c);
// 		break;
// 	}
// 	for(let c of array){
// 		console.log(c);
// 	}
// }

// function test_isplice(){
// 	console.log('\n\ntest_isplice');
// 	let x = Array.iterable([1,2,3]);
// 	console.log([...x.isplice(0,1,0,0,0)]);
// }

// function test_ichunk(){
// 	console.log('\n\ntest_ichunk');
// 	let number = gen_number();

// 	Array
// 		.ichunk(number,2)
// 		.imap(([a,b])=>a*b)
// 		.idropWhile((_,i)=>i<10)
// 		.itakeWhile((_,i)=>i<10)
// 		.forEach(c=>console.log(c));

// 	Array
// 		.ichunk(number,3)
// 		.imap(([a,b,c])=>a*b*c)
// 		.itakeWhile((_,i)=>i<10)
// 		.forEach(c=>console.log(c));

// }

// function test_izip(){
// 	console.log('\n\ntest_izip');

// 	let number = gen_number();
// 	let even = gen_even();
// 	let odd = gen_odd();
// 	let fi = gen_fibonacci();

// 	let c = 0;
// 	Array.izip(number,fi)
// 		.itakeWhile((c,i)=>i<20)
// 		.forEach(c=>console.log(c));

// }

// function test_dropWhile(){
// 	console.log('\n\ntest_dropWhile');
// 	let fi = gen_fibonacci();

// 	Array
// 		.itakeWhile(fi, (_,i)=> i < 10)
// 		.forEach(v=>console.log(v));

// 	// console.log([0,0,0,1,2,3,4,0,0].dropWhile(v=>!v));
// }

// function test_takeWhile(){
// 	console.log('\n\ntest_takeWhile');

// 	console.log([1,2,3,0,0,0,1,2].takeWhile());
// }

// test_Generator();
// // test_Generator2();
// // test_isplice();

// // test_ichunk();
// // test_izip();
// // test_dropWhile();
// // test_takeWhile();

// console.log([1,2,3,4]);
