/**
 * 権限のビットマスク。kikikan(`C:\EL`)の`app/(main)/_lib/permission.ts`と同じ方式で、
 * `m_user.permission`に立っているビットをANDで判定する。
 *
 * 値はDBに入っている数値そのものなので、既存の割り当てを壊さないよう
 * 既存ビットの意味は変えず、追加は空いているビットに割り当てること。
 */
export const PERMISSION = {
  none: 0,
  /** 受注部担当者。機材表の申請先として選択できる */
  juchu_tanto: 1,
  /** 全権限 */
  system: 65535,
} as const;

/**
 * 権限を持っているかを判定する関数
 * @param permission m_user.permissionの値
 * @param target 判定したい権限（PERMISSIONの値）
 * @returns 権限を持っていればtrue
 */
export const hasPermission = (permission: number, target: number) => (permission & target) !== 0;
