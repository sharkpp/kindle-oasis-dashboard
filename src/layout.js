/**
 * カラムと項目の配置。
 *
 * 画面をカラムに横分割し、各カラムの中で項目を縦に積む。
 * 幅も高さも比率で指定する。端末ごとに画素数が違うので、px では持たない。
 */

/**
 * @param {Array<{width:number, items:Array<{height:number}>}>} columns
 * @param {{x:number,y:number,w:number,h:number}} area 画面から余白を引いた領域
 * @param {number} gap 項目とカラムのすき間（px）
 * @returns {Array<{item:object, x:number, y:number, w:number, h:number}>}
 */
export function layout(columns, area, gap) {
  const boxes = [];
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const usableWidth = area.w - gap * (columns.length - 1);

  let x = area.x;
  for (const column of columns) {
    const w = (usableWidth * column.width) / totalWidth;
    const totalHeight = column.items.reduce((sum, item) => sum + item.height, 0);
    const usableHeight = area.h - gap * (column.items.length - 1);

    let y = area.y;
    for (const item of column.items) {
      const h = (usableHeight * item.height) / totalHeight;
      boxes.push({ item, x, y, w, h });
      y += h + gap;
    }
    x += w + gap;
  }
  return boxes;
}
