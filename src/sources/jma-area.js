/**
 * 気象庁の区域表。市町村コードから、予報を取りに行くのに必要なコードを引く。
 *
 * 気象庁は天気と降水確率を一次細分区域（東京地方など）、気温をアメダス地点の単位で
 * 出している。市町村そのものの予報は無いので、市町村コードからその市町村が属する
 * 区域と地点を求める。警報・注意報だけは市町村の単位で出ているので、そのまま使う。
 *
 * - 区域の親子 https://www.jma.go.jp/bosai/common/const/area.json
 * - 区域とアメダス地点の対応 https://www.jma.go.jp/bosai/forecast/const/forecast_area.json
 *
 * どちらも滅多に変わらないので、一度取ったらプロセスの間は持ち続ける。
 */

const AREA_URL = 'https://www.jma.go.jp/bosai/common/const/area.json';
const FORECAST_AREA_URL = 'https://www.jma.go.jp/bosai/forecast/const/forecast_area.json';

let tables = null;

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** 区域表。取得済みならそれを返す。 */
export function areaTables() {
  tables ??= Promise.all([fetchJson(AREA_URL), fetchJson(FORECAST_AREA_URL)])
    .then(([area, forecastArea]) => ({ area, forecastArea }))
    .catch((err) => {
      // 次の取得でやり直せるようにする。
      tables = null;
      throw err;
    });
  return tables;
}

/**
 * 市町村コードから、予報の取得と読み取りに必要なコードを求める。
 *
 * @param {string} city 市町村コード（千代田区なら 1310100）
 * @returns {{office: string, class10: string, amedas: string, city: string, names: object}}
 */
export function resolveCity(city, { area, forecastArea }) {
  const municipality = area.class20s?.[city];
  if (!municipality) throw new Error(`市町村コード ${city} は気象庁の区域表にありません`);

  const class15 = area.class15s[municipality.parent];
  const class10Code = class15.parent;
  const class10 = area.class10s[class10Code];
  const office = class10.parent;

  // 気温はアメダス地点ごとに出る。その一次細分区域の代表地点を使う。
  const entry = (forecastArea[office] ?? []).find((item) => item.class10 === class10Code);
  const amedas = entry?.amedas?.[0];
  if (!amedas) throw new Error(`${class10.name} に気温の地点がありません`);

  return {
    office,
    class10: class10Code,
    amedas,
    city,
    names: {
      city: municipality.name,
      class10: class10.name,
      office: area.offices[office].name,
    },
  };
}
