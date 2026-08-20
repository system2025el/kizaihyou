import { EquipmentTableHead } from '../equipment-table-list/types';

/**
 * 申請するために埋まっていなければならない項目を確かめる関数。
 *
 * 保存は書きかけでもできるので、ここを通すのは申請のときだけ。
 * 承認すると機材管理へ受注を作りに行き、そこで公演名・顧客・出庫日・入庫日が
 * 必要になる（出庫日・入庫日が無いと使用日カレンダーが作れず在庫も引き当たらない）ため、
 * 申請の時点で押さえておく。
 *
 * 画面とServer Actionsの両方から呼ぶ。画面で止めるだけでは
 * Server Actionsを直接呼ばれたときに素通りしてしまうため。
 *
 * @param head 機材表のヘッダ
 * @returns 問題の一覧（空なら申請できる）
 */
export const validateForRequest = (head: EquipmentTableHead): string[] => {
  const errors: string[] = [];

  if (!head.eventName.trim()) errors.push('公演名を入力してください。');
  if (!head.clientName.trim()) errors.push('顧客名を入力してください。');
  if (!head.shippedAt) errors.push('出庫日を入力してください。');
  if (!head.returnedAt) errors.push('入庫日を入力してください。');

  // YYYY-MM-DDなので文字列のまま比較できる。同じ日（当日返し）は許す
  if (head.shippedAt && head.returnedAt && head.shippedAt > head.returnedAt) {
    errors.push('入庫日は出庫日と同じ日か、それより後の日付にしてください。');
  }

  return errors;
};
