import { EquipmentColumn, EquipmentRow } from '@/app/_lib/equipment-table/types';

export type EquipmentTableStatus = '作成中' | '申請中' | '差戻し' | '承認済' | '取下げ' | '完了';

/** m_kizaihyou_sts.sts_cod。DBのマスタと一致させること */
export const KIZAIHYOU_STS: Record<EquipmentTableStatus, number> = {
  作成中: 1,
  申請中: 2,
  差戻し: 3,
  承認済: 4,
  取下げ: 5,
  完了: 6,
};

/**
 * t_kizaihyou_his.act_cod。DBの値と一致させること。
 * act_namは表示用の文字列（'申請（受注部担当者：◯◯）'など）で判定に使えないため、
 * 操作の種類はこのコードで判別する。
 */
export const KIZAIHYOU_ACT = {
  /** 旧データ（この列を入れる前の履歴） */
  不明: 0,
  新規作成: 1,
  保存: 2,
  申請: 3,
  承認: 4,
  差戻し: 5,
  取り下げ: 6,
  コメント: 7,
  /** kikikanへの連携が成功（memに受注番号と明細件数） */
  連携: 8,
  /** kikikanへの連携が失敗（memに理由）。承認自体は成立している */
  連携失敗: 9,
  完了: 10,
  完了解除: 11,
  /** 論理削除（del_flg = 1）。ステータスは変えない */
  削除: 12,
  復元: 13,
  /** メンバーの招待・権限変更・外す（act_namに誰をどうしたか） */
  メンバー変更: 14,
  /** 持ち主による編集ロックの強制解除（act_namに誰のロックを外したか） */
  ロック解除: 15,
} as const;

/** m_kizaihyou_sts.chip_colorが取りうる値（MUIのChip color） */
export type EquipmentTableStatusColor = 'default' | 'info' | 'error' | 'success' | 'warning' | 'secondary';

/** 申請時に選ぶ受注部担当者の候補（m_userのうち受注部担当者権限を持つ人） */
export type JuchuTantoOption = {
  userId: string;
  userNam: string;
};

export type EquipmentTableHistoryEntry = {
  /** t_kizaihyou_his.his_id（スナップショット閲覧ページのURLに使う） */
  hisId: number;
  at: string;
  user: string;
  action: string;
  /** 申請・承認・差戻し時のコメント、または自由コメント */
  comment: string;
  /** その時点の機材表（スナップショット）を持つ履歴か */
  hasSnapshot: boolean;
};

export type EquipmentTableContent = {
  columns: EquipmentColumn[];
  rows: EquipmentRow[];
};

export type EquipmentTableListRow = {
  id: number;
  /** 画面表示用の機材表ID（KZ-0001形式） */
  cod: string;
  eventName: string;
  place: string;
  clientName: string;
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  returnedAt: string | null;
  status: EquipmentTableStatus;
  statusColor: EquipmentTableStatusColor;
  /** 受注部担当者名（申請先） */
  salesStaffName: string;
  /** 依頼者名（申請した人）。未申請なら空文字 */
  requesterName: string;
  /** 申請先の受注部担当者のuser_id。この誰か1人が承認すれば承認済になる */
  tantoUserIds: string[];
  /** kikikanに作った受注番号。未連携ならnull */
  juchuHeadId: number | null;
  /** kikikanへの連携が最後まで済んでいるか（機材明細まで作られたか） */
  juchuLinked: boolean;
  /** 削除済み（del_flg = 1）か。一覧は「削除済も表示」にしたときだけ出す */
  deleted: boolean;
  /**
   * 申請時点のスナップショットを持つ操作履歴のhis_id。
   * 承認済ならこれが「承認された内容」、申請中なら「申請した内容」。
   * 申請していない・スナップショットが無い場合はnull。
   */
  shinseiHisId: number | null;
  /**
   * ログイン中のユーザーのこの機材表での権限（t_kizaihyou_member.role_cod）。
   * 機材表履歴一覧（自分がメンバーの機材表）でだけ入る。申請依頼の一覧ではnull
   */
  myRole: number | null;
};

/**
 * 機材表申請依頼画面の「対応済み」タブに出す1行。
 * 一覧の行に、直近の承認・差戻しが誰のいつの操作だったかを足したもの。
 */
export type ApprovalHandledRow = EquipmentTableListRow & {
  /** 直近の対応（'承認' か '差戻し'） */
  handledAct: string;
  handledBy: string;
  handledAt: string;
  /** これまでに承認された回数。1回以上なら、今の申請は承認済からの再申請 */
  approvedCount: number;
  /** これまでに差し戻された回数 */
  rejectedCount: number;
};

/** 機材表画面が扱うヘッダ情報 */
export type EquipmentTableHead = {
  eventName: string;
  place: string;
  clientName: string;
  /** YYYY-MM-DD */
  shippedAt: string;
  /** YYYY-MM-DD */
  returnedAt: string;
  /** 機材表全体の備考（行ごとの備考とは別物） */
  memo: string;
};
