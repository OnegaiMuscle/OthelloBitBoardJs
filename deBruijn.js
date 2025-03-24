function bitPositions(bitboard) {
  const deBruijn64 = 0x03f79d71b4cb0a89n;
  const index64 = [
    0, 1, 48, 2, 57, 49, 28, 3,
    61, 58, 50, 42, 38, 29, 17, 4,
    62, 55, 59, 36, 53, 51, 43, 22,
    45, 39, 33, 30, 24, 18, 12, 5,
    63, 47, 56, 27, 60, 41, 37, 16,
    54, 35, 52, 21, 44, 32, 23, 11,
    46, 26, 40, 15, 34, 20, 31, 10,
    25, 14, 19, 9, 13, 8, 7, 6
  ];

  let positions = [];
  while (bitboard) {
      let bit = bitboard & -bitboard;
      let shift = Number(bit * deBruijn64 >> 58n & 63n);
      let index = index64[shift];
      positions.push(index);
      bitboard ^= bit;
  }
  return positions;
}

function bitPositionsbis(bitboard) {
  const deBruijn64 = 0x03f79d71b4cb0a89n;
  const index64 = [
    0, 1, 48, 2, 57, 49, 28, 3,
    61, 58, 50, 42, 38, 29, 17, 4,
    62, 55, 59, 36, 53, 51, 43, 22,
    45, 39, 33, 30, 24, 18, 12, 5,
    63, 47, 56, 27, 60, 41, 37, 16,
    54, 35, 52, 21, 44, 32, 23, 11,
    46, 26, 40, 15, 34, 20, 31, 10,
    25, 14, 19, 9, 13, 8, 7, 6
  ];

  let positions = [];
  while (bitboard) {
      let bit = bitboard & -bitboard;
      let shift = Number(bit * deBruijn64 >> 58n & 63n);
      let index = index64[shift];
      positions.push(index);
      bitboard &= bitboard - 1n;
  }
  return positions;
}



let board1 = 0b1010101010101010101010101010101010101010101010101010101010101010n;
let board2 = 0b0101010101010101010101010101010101010101010101010101010101010101n;


console.time("bitPositions");
console.log(bitPositions(board1));
console.log(bitPositions(board2));
console.timeEnd("bitPositions");
