'use server';

import { DatabaseError } from 'pg';

import { KIKIKAN_JUCHU_HEAD_ID_MIN } from './constants';
import { KIKIKAN_SCHEMA, kikikanPool } from './postgres-kikikan';

/** 受注ヘッダー（伝票）の登録で受け取る値 */
export type KikikanJuchuHeadInput = {
  koenNam: string;
  koenbashoNam: string | null;
  kokyakuId: number;
  /** 受注日（YYYY-MM-DD） */
  juchuDat: string;
  /** 受注期間の開始・終了（YYYY-MM-DD）。機材表の出庫日・入庫日 */
  juchuStrDat: string | null;
  juchuEndDat: string | null;
  juchuSts: number;
  zeiKbn: number;
  nyuryokuUser: string;
  mem: string | null;
};

/** 一意制約違反（採番が他の人と衝突した） */
const isUniqueViolation = (e: unknown) => e instanceof DatabaseError && e.code === '23505';

/** 採番の衝突でやり直す回数 */
const RETRY_COUNT = 5;

/**
 * kikikanに受注ヘッダー（伝票）を作る関数。
 *
 * **`juchu_head_id`はシーケンスではなくアプリ側の`max+1`**で決まる
 * （kikikan本体もそうしている）。kikikanの画面から同時に受注が作られると
 * 採番が衝突しうるので、主キーの一意制約違反を検知して採番し直す。
 *
 * @param input 登録する値
 * @returns 採番されたjuchu_head_id
 */
export const insertKikikanJuchuHead = async (input: KikikanJuchuHeadInput): Promise<number> => {
  for (let attempt = 0; attempt < RETRY_COUNT; attempt += 1) {
    const max = await kikikanPool.query<{ max_id: string | null }>(
      `SELECT max(juchu_head_id) AS max_id FROM ${KIKIKAN_SCHEMA}.t_juchu_head`
    );
    const juchuHeadId = Math.max(Number(max.rows[0].max_id ?? 0) + 1, KIKIKAN_JUCHU_HEAD_ID_MIN);

    try {
      await kikikanPool.query(
        `INSERT INTO ${KIKIKAN_SCHEMA}.t_juchu_head
                (juchu_head_id, del_flg, juchu_sts, juchu_dat, juchu_str_dat, juchu_end_dat,
                 nyuryoku_user, koen_nam, koenbasho_nam, kokyaku_id, mem, zei_kbn, add_dat, add_user)
         VALUES ($1, 0, $2, $3::date, $4::date, $5::date, $6, $7, $8, $9, $10, $11, now(), $6)`,
        [
          juchuHeadId,
          input.juchuSts,
          input.juchuDat,
          input.juchuStrDat,
          input.juchuEndDat,
          input.nyuryokuUser,
          input.koenNam,
          input.koenbashoNam,
          input.kokyakuId,
          input.mem,
          input.zeiKbn,
        ]
      );
      return juchuHeadId;
    } catch (e) {
      // 採番が衝突しただけならmaxを取り直してやり直す
      if (isUniqueViolation(e) && attempt < RETRY_COUNT - 1) continue;
      throw new Error('[insertKikikanJuchuHead] kikikanのDBエラー:', { cause: e });
    }
  }

  throw new Error('[insertKikikanJuchuHead] 受注番号の採番が繰り返し衝突しました');
};

/** 既存の受注ヘッダー（機材明細を追加する先の照合に使う） */
export type KikikanJuchuHead = {
  juchuHeadId: number;
  koenNam: string;
  koenbashoNam: string;
  kokyakuNam: string;
  nyuryokuUser: string;
};

/**
 * 受注ヘッダーを1件取得する関数（照合用の参照のみ）。
 * 既にある伝票に機材明細だけ追加する場合、機材表の内容と食い違っていないかを見るのに使う。
 *
 * @param juchuHeadId 探す受注番号
 * @returns 受注ヘッダー。無ければnull
 */
export const selectKikikanJuchuHead = async (juchuHeadId: number): Promise<KikikanJuchuHead | null> => {
  try {
    const { rows } = await kikikanPool.query<{
      juchu_head_id: number;
      koen_nam: string | null;
      koenbasho_nam: string | null;
      kokyaku_nam: string | null;
      nyuryoku_user: string | null;
    }>(
      `SELECT h.juchu_head_id, h.koen_nam, h.koenbasho_nam, k.kokyaku_nam, h.nyuryoku_user
         FROM ${KIKIKAN_SCHEMA}.t_juchu_head h
         LEFT JOIN ${KIKIKAN_SCHEMA}.m_kokyaku k ON k.kokyaku_id = h.kokyaku_id
        WHERE h.juchu_head_id = $1 AND coalesce(h.del_flg, 0) = 0`,
      [juchuHeadId]
    );
    if (!rows.length) return null;

    const row = rows[0];
    return {
      juchuHeadId: row.juchu_head_id,
      koenNam: row.koen_nam ?? '',
      koenbashoNam: row.koenbasho_nam ?? '',
      kokyakuNam: row.kokyaku_nam ?? '',
      nyuryokuUser: row.nyuryoku_user ?? '',
    };
  } catch (e) {
    throw new Error('[selectKikikanJuchuHead] kikikanのDBエラー:', { cause: e });
  }
};
