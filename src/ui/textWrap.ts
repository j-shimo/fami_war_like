// 日本語の文章を折り返すための純粋な関数。Phaser には依存しない。
//
// Phaser の wordWrap は半角スペースの位置でしか折り返せないため、
// スペースを含まない日本語の文章はいくら幅を指定しても 1 行のまま画面からはみ出す。
// ここでは文字数で折り返し、行頭に来ると読みにくい記号だけ前の行へぶら下げる。

/**
 * 行頭に置かない文字(禁則処理の対象)。
 * 折り返し位置がこれらの文字に当たった場合は、1 文字だけ前の行へはみ出させる。
 */
const NO_LINE_START = '、。,.」』)〕】〉!?!?・ー';

/**
 * text を 1 行あたり maxCharsPerLine 文字で折り返した文字列を返す。
 * すでに入っている改行はそのまま残し、行ごとに折り返す。
 *
 * @param maxCharsPerLine 1 行あたりの最大文字数(全角基準)。1 未満なら折り返さない
 */
export function wrapText(text: string, maxCharsPerLine: number): string {
  if (maxCharsPerLine < 1) {
    return text;
  }
  return text
    .split('\n')
    .map((line) => wrapLine(line, maxCharsPerLine))
    .join('\n');
}

/** 改行を含まない 1 行ぶんを折り返す */
function wrapLine(line: string, maxCharsPerLine: number): string {
  const chars = [...line];
  const result: string[] = [];
  let index = 0;

  while (index < chars.length) {
    let end = Math.min(index + maxCharsPerLine, chars.length);
    // 次の行の先頭が句読点・閉じ括弧になる場合は、その 1 文字を今の行へぶら下げる
    while (end < chars.length && NO_LINE_START.includes(chars[end])) {
      end += 1;
    }
    result.push(chars.slice(index, end).join(''));
    index = end;
  }

  return result.join('\n');
}
