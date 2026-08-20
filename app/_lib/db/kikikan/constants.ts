/**
 * kikikanへ受注を作るときの固定値。
 * 運用が固まるまでの暫定値で、いずれ機材表側で選べるようにする想定。
 */

/** 顧客：(株)エンジニア・ライティング（kikikanのm_kokyaku.kokyaku_id） */
export const KIKIKAN_FIXED_KOKYAKU_ID = 1013;

/** 入力者（t_juchu_head.nyuryoku_user）。kikikanでは選択式だがここでは固定 */
export const KIKIKAN_FIXED_NYURYOKU_USER = '米山';

/** 受注ステータス（m_juchu_sts）。0=入力中。kikikanの直近の受注もすべて0 */
export const KIKIKAN_JUCHU_STS_NYURYOKU = 0;

/** 税区分（m_zei）。2=外税。kikikanの直近の受注もすべて2 */
export const KIKIKAN_ZEI_KBN_SOTOZEI = 2;

/**
 * 受注番号の下限。kikikanは`max(juchu_head_id)+1`で採番し、
 * 90000未満なら90000から始める運用になっている（移行データと分けるため）。
 */
export const KIKIKAN_JUCHU_HEAD_ID_MIN = 90000;

/**
 * 受注機材ヘッダー区分（juchu_kizai_head_kbn）。
 * kikikanの`app/_lib/constants.ts`のJUCHU_KIZAI_HEAD_KBNと一致させること。
 */
export const KIKIKAN_JUCHU_KIZAI_HEAD_KBN = { normal: 1, return: 2, keep: 3 } as const;

/** 場所ID（shozoku_id / sagyo_id / nyushuko_basho_id）。kikikanのBASHO_ID */
export const KIKIKAN_BASHO_ID = { kics: 1, yard: 2, others: 3 } as const;

/** 入出庫種別（nyushuko_shubetu_id）。kikikanのNYUSHUKO_SHUBETU_ID */
export const KIKIKAN_NYUSHUKO_SHUBETU_ID = { shuko: 1, nyuko: 2 } as const;

/** 受注本番日種別（juchu_honbanbi_shubetu_id）。kikikanのHONBANBI_SHUBETU_ID */
export const KIKIKAN_HONBANBI_SHUBETU_ID = {
  use: 1,
  shuko: 2,
  nyuko: 3,
  shikomi: 10,
  rh: 20,
  gp: 30,
  honban: 40,
} as const;

/** 作業区分（sagyo_kbn_id）。kikikanのSAGYO_KBN_ID */
export const KIKIKAN_SAGYO_KBN_ID = {
  shukoPicking: 10,
  shukoConfirmation: 20,
  nyukoCount: 30,
  idoShuko: 40,
  idoNyuko: 50,
} as const;

/**
 * 本番日数（juchu_honbanbi_qty）。
 * kikikanは「本番日(種別40)の件数 + 加算数」で自動計算しており、
 * 機材表は本番日を持たないので0になる。受注部がkikikan側で入力し直す前提。
 */
export const KIKIKAN_HONBANBI_QTY_DEFAULT = 0;
