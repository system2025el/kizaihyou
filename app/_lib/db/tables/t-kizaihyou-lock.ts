'use server';

import pool from '../postgres';
import { SCHEMA } from '../schema';

/** 編集ロックの行。時刻の比較はDB（now()）で行い、サーバーと画面の時計のずれに左右されないようにする */
export type KizaihyouLockRow = {
  user_id: string;
  user_nam: string;
  /** 最後に延長してから何分たったか */
  idle_minutes: number;
  /** あと何秒で切れるか（切れていれば0以下） */
  expires_in_seconds: number;
};

const LOCK_COLUMNS = `
  user_id, user_nam,
  floor(extract(epoch from now() - last_act_dat) / 60)::int AS idle_minutes,
  ceil(extract(epoch from expire_dat - now()))::int AS expires_in_seconds
`;

/**
 * 編集ロックを取る（または延長する）関数。
 *
 * 次のどちらかなら取れる：ロックが無い／自分が持っている／持ち主の期限が切れている。
 * 「空いているか確かめる」と「取る」を1文（INSERT ... ON CONFLICT DO UPDATE ... WHERE）で行うので、
 * 2人がほぼ同時に取りに来ても取れるのは1人だけになる（kikikanのt_lockは2段階で、ここに隙間がある）。
 *
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 取る人のm_user.user_id
 * @param userNam 取る人の氏名（閲覧側に「○○さんが編集中」と出す）
 * @param ttlMinutes 何分後に切れるか
 * @returns 取れたらロックの行、他の人が持っていればnull
 */
export const acquireKizaihyouLock = async (
  kizaihyouId: number,
  userId: string,
  userNam: string,
  ttlMinutes: number
): Promise<KizaihyouLockRow | null> => {
  try {
    const { rows } = await pool.query<KizaihyouLockRow>(
      `INSERT INTO ${SCHEMA}.t_kizaihyou_lock AS l
              (kizaihyou_id, user_id, user_nam, lock_dat, last_act_dat, expire_dat)
       VALUES ($1, $2, $3, now(), now(), now() + make_interval(mins => $4))
       ON CONFLICT (kizaihyou_id) DO UPDATE
          SET user_id = excluded.user_id,
              user_nam = excluded.user_nam,
              -- 自分の延長なら編集を始めた日時は変えない
              lock_dat = CASE WHEN l.user_id = excluded.user_id AND l.expire_dat > now() THEN l.lock_dat ELSE now() END,
              last_act_dat = now(),
              expire_dat = excluded.expire_dat
        WHERE l.user_id = excluded.user_id OR l.expire_dat <= now()
       RETURNING ${LOCK_COLUMNS}`,
      [kizaihyouId, userId, userNam, ttlMinutes]
    );
    return rows[0] ?? null;
  } catch (e) {
    throw new Error('[acquireKizaihyouLock] DBエラー:', { cause: e });
  }
};

/**
 * 有効な（期限の切れていない）編集ロックを取得する関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @returns ロックの行。誰も編集していなければnull
 */
export const selectKizaihyouLock = async (kizaihyouId: number): Promise<KizaihyouLockRow | null> => {
  try {
    const { rows } = await pool.query<KizaihyouLockRow>(
      `SELECT ${LOCK_COLUMNS} FROM ${SCHEMA}.t_kizaihyou_lock WHERE kizaihyou_id = $1 AND expire_dat > now()`,
      [kizaihyouId]
    );
    return rows[0] ?? null;
  } catch (e) {
    throw new Error('[selectKizaihyouLock] DBエラー:', { cause: e });
  }
};

/**
 * 編集ロックを外す関数
 * @param kizaihyouId 対象のkizaihyou_id
 * @param userId 外す人のm_user.user_id。nullなら持ち主に関係なく外す（持ち主による強制解除）
 * @returns 外したロックの持ち主の氏名（何も外さなければnull）
 */
export const deleteKizaihyouLock = async (kizaihyouId: number, userId: string | null): Promise<string | null> => {
  try {
    const { rows } = await pool.query<{ user_nam: string }>(
      `DELETE FROM ${SCHEMA}.t_kizaihyou_lock
        WHERE kizaihyou_id = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid)
        RETURNING user_nam`,
      [kizaihyouId, userId]
    );
    return rows[0]?.user_nam ?? null;
  } catch (e) {
    throw new Error('[deleteKizaihyouLock] DBエラー:', { cause: e });
  }
};
