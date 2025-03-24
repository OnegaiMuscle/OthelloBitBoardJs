function popcountMagic(n) {
  n = n - (n >> 1n & 0x5555555555555555n);
  n = (n & 0x3333333333333333n) + (n >> 2n & 0x3333333333333333n);
  n = (n + (n >> 4n)) & 0x0F0F0F0F0F0F0F0Fn;
  n = n * 0x0101010101010101n >> 56n & 255n;
  return Number(n);
}

function popcountSWAR(n) {
  n = n - ((n >> 1n) & 0x5555555555555555n);
  n = (n & 0x3333333333333333n) + ((n >> 2n) & 0x3333333333333333n);
  n = (n + (n >> 4n)) & 0x0F0F0F0F0F0F0F0Fn;
  n += n >> 8n;
  n += n >> 16n;
  n += n >> 32n;
  return Number(n & 0x7Fn);
}

let bigInt1 = 0b111111111111111111111111111111111111111100000000000000n;
let bigInt2 = 0xA3B4C5D6E7F81F29n;

console.time("Magic Number");
console.log(popcountMagic(bigInt1));
console.log(popcountMagic(bigInt2));
console.timeEnd("Magic Number");

console.time("Swar Swar");
console.log(popcountSWAR(bigInt1));
console.log(popcountSWAR(bigInt2));
console.timeEnd("Swar Swar");



function benchmark(fn, name) {
    let start = performance.now();
    for (let i = 0; i < 1e6; i++) {
        fn(0xFFFFFFFFFFFFFFFFn); // Test sur un bitboard plein
    }
    let end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)} ms`);
}

benchmark(popcountMagic, "Magic Number");
benchmark(popcountSWAR, "SWAR classique");
