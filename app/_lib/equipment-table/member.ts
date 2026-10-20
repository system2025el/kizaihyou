/**
 * 機材表のメンバー権限と編集ロックの定義。画面とサーバーの両方から使う。
 *
 * 権限は段階になっていて、上の段階は下の段階でできることを全部できる。
 * 値は`t_kizaihyou_member.role_cod`そのもので、大小で比べられるようにしてある。
 */
export const KIZAIHYOU_ROLE = {
  /** 開いて見る・Excel/PDF出力・コメント・流用して新規作成 */
  閲覧: 1,
  /** ＋編集・保存（編集ロックを取れる） */
  編集: 2,
  /** ＋申請・取り下げ */
  申請: 3,
  /** ＋メンバーの招待・権限変更・外す、削除・完了・作成中に戻す、ロックの強制解除（作成者。1機材表に1人） */
  持ち主: 9,
} as const;

export type KizaihyouRole = (typeof KIZAIHYOU_ROLE)[keyof typeof KIZAIHYOU_ROLE];

/** 招待するときに選べる権限（持ち主は作成者だけなので選べない） */
export const INVITABLE_ROLES = [KIZAIHYOU_ROLE.閲覧, KIZAIHYOU_ROLE.編集, KIZAIHYOU_ROLE.申請] as const;

export const ROLE_LABELS: Record<KizaihyouRole, string> = {
  [KIZAIHYOU_ROLE.閲覧]: '閲覧',
  [KIZAIHYOU_ROLE.編集]: '編集',
  [KIZAIHYOU_ROLE.申請]: '申請',
  [KIZAIHYOU_ROLE.持ち主]: '持ち主',
};

/** DBの値を権限に直す。想定外の値は一番弱い閲覧として扱う */
export const toRole = (value: number): KizaihyouRole =>
  (Object.values(KIZAIHYOU_ROLE) as number[]).includes(value) ? (value as KizaihyouRole) : KIZAIHYOU_ROLE.閲覧;

/** その権限で、指定した操作に必要な権限を満たしているか */
export const hasRole = (role: KizaihyouRole | null, required: KizaihyouRole) => role !== null && role >= required;

/**
 * ログイン中のユーザーがこの機材表に対して持っている権限。
 * memberがfalseなのは、メンバーではないが受注部担当者として閲覧だけできる場合
 * （承認画面から申請時点の内容などを開くため）。
 */
export type KizaihyouAccess = {
  role: KizaihyouRole;
  member: boolean;
};

/** 編集できないステータス。申請中は承認者が申請時点の内容を見ており、完了は締めた案件 */
export const READ_ONLY_STATUS_NAMES = ['申請中', '完了'];

/** 操作していないと編集ロックが切れるまでの時間 */
export const EDIT_LOCK_TTL_MINUTES = 10;
/** 編集中の画面がロックを延長しに行く間隔（その間に操作があったときだけ延長する） */
export const EDIT_LOCK_HEARTBEAT_MS = 60 * 1000;
/** ロックが切れる何秒前から画面に警告を出すか */
export const EDIT_LOCK_WARN_SECONDS = 60;
/** 閲覧している画面がロックの状態と更新を確かめに行く間隔 */
export const EDIT_STATUS_POLL_MS = 30 * 1000;

/** 編集ロックの状態（画面に出す用） */
export type EditLockInfo = {
  userId: string;
  userNam: string;
  /** ログイン中のユーザー自身が持っているか */
  mine: boolean;
  /** 最後に操作して延長してから何分たったか */
  idleMinutes: number;
  /** あと何秒で切れるか */
  expiresInSeconds: number;
};

/** 閲覧している画面が定期的に取りに行く、機材表の今の状態 */
export type EditStatus = {
  /** 有効な編集ロック。誰も編集していなければnull */
  lock: EditLockInfo | null;
  /** 内容の版。画面が持っている版より新しければ、誰かが保存した */
  contentVer: number;
};

/** 編集ロックを取りに行った結果 */
export type StartEditingResult =
  | { ok: true; expiresInSeconds: number; contentVer: number }
  | { ok: false; reason: 'locked'; lock: EditLockInfo }
  | { ok: false; reason: 'forbidden' | 'readonly'; message: string };

/** 保存・申請の結果。ロックや版の食い違いは例外にせず、画面で文言を出し分けられるよう返す */
export type SaveResult =
  | { ok: true; kizaihyouId: number; contentVer: number }
  | { ok: false; reason: 'locked'; lock: EditLockInfo }
  | { ok: false; reason: 'conflict' | 'forbidden' | 'readonly'; message: string };

/** メンバー1人分 */
export type KizaihyouMember = {
  userId: string;
  userNam: string;
  email: string;
  role: KizaihyouRole;
};

/** 招待の候補（kizaihyouにアカウントがある人） */
export type MemberCandidate = {
  userId: string;
  userNam: string;
  email: string;
};
