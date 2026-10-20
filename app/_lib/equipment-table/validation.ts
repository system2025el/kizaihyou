import { EquipmentTableHead } from '../equipment-table-list/types';
import { EquipmentRow } from './types';

/**
 * 機材管理（kikikan）へ連携する項目の文字数の上限。
 *
 * kizaihyou側は`text`で上限が無いが、連携先はvarcharなので超えると
 * 承認後の連携で`value too long`になって失敗する。値はkikikanのカラム定義に合わせる。
 * kikikanのカラム定義が変わったらここも直すこと。
 */
export const KIKIKAN_MAX_LENGTH = {
  /** t_juchu_head.koen_nam varchar(100)（t_juchu_kizai_head.head_namは200なのでこちらで決まる） */
  eventName: 100,
  /** t_juchu_head.koenbasho_nam varchar(100) */
  place: 100,
  /** t_juchu_head.mem varchar(200) */
  memo: 200,
  /** t_juchu_kizai_meisai.mem varchar(200) */
  remark: 200,
} as const;

/**
 * 文字数を数える関数。
 * Postgresのvarchar(n)は文字（コードポイント）で数えるので、UTF-16単位の`length`ではなく
 * コードポイントで数える（絵文字や一部の漢字が2と数えられないように）。
 */
const countChars = (value: string) => Array.from(value).length;

/**
 * 機材管理へ連携する項目が、連携先の文字数の上限に収まっているかを確かめる関数。
 *
 * 申請時（`validateForRequest`）と承認時の連携直前の両方から呼ぶ。
 * 後者は、このチェックより前に申請されたものが承認されたときに、
 * kikikanのDBエラーではなく直すべき箇所が分かる文言で止めるため。
 *
 * 行の備考は機材マスタから選んだ行だけを見る。手入力の名称の行は連携しないため。
 *
 * @param head 機材表のヘッダ
 * @param rows 機材表の行
 * @returns 問題の一覧（空なら収まっている）
 */
export const validateLengthForKikikan = (head: EquipmentTableHead, rows: EquipmentRow[]): string[] => {
  const errors: string[] = [];

  const checkHead = (label: string, value: string, max: number) => {
    const length = countChars(value);
    if (length > max) errors.push(`${label}は${max}文字以内にしてください（現在${length}文字）。`);
  };
  checkHead('公演名', head.eventName, KIKIKAN_MAX_LENGTH.eventName);
  checkHead('場所', head.place, KIKIKAN_MAX_LENGTH.place);
  checkHead('備考', head.memo, KIKIKAN_MAX_LENGTH.memo);

  rows.forEach((row, index) => {
    if (row.kizaiId === null || !row.name.trim()) return;
    const length = countChars(row.remark);
    if (length > KIKIKAN_MAX_LENGTH.remark) {
      errors.push(
        `${index + 1}行目「${row.name}」の備考は${KIKIKAN_MAX_LENGTH.remark}文字以内にしてください（現在${length}文字）。`
      );
    }
  });

  return errors;
};

/**
 * 申請するために満たしていなければならない条件を確かめる関数。
 *
 * 保存は書きかけでもできるので、ここを通すのは申請のときだけ。
 * 承認すると機材管理へ受注を作りに行き、そこで公演名・顧客・出庫日・入庫日が
 * 必要になる（出庫日・入庫日が無いと使用日カレンダーが作れず在庫も引き当たらない）ため、
 * 申請の時点で押さえておく。連携先の文字数の上限も同じ理由でここで見る。
 *
 * 画面とServer Actionsの両方から呼ぶ。画面で止めるだけでは
 * Server Actionsを直接呼ばれたときに素通りしてしまうため。
 *
 * @param head 機材表のヘッダ
 * @param rows 機材表の行
 * @returns 問題の一覧（空なら申請できる）
 */
export const validateForRequest = (head: EquipmentTableHead, rows: EquipmentRow[]): string[] => {
  const errors: string[] = [];

  if (!head.eventName.trim()) errors.push('公演名を入力してください。');
  if (!head.clientName.trim()) errors.push('顧客名を入力してください。');
  if (!head.shippedAt) errors.push('出庫日を入力してください。');
  if (!head.returnedAt) errors.push('入庫日を入力してください。');

  // YYYY-MM-DDなので文字列のまま比較できる。同じ日（当日返し）は許す
  if (head.shippedAt && head.returnedAt && head.shippedAt > head.returnedAt) {
    errors.push('入庫日は出庫日と同じ日か、それより後の日付にしてください。');
  }

  errors.push(...validateLengthForKikikan(head, rows));

  return errors;
};
