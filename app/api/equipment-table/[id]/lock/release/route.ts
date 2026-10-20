import { NextResponse } from 'next/server';

import { stopEditing } from '@/app/_lib/equipment-table/lock-funcs';

/**
 * 編集中にタブを閉じた・別のページへ移ったときに、自分の編集ロックを外すエンドポイント。
 *
 * このリポジトリはAPI RouteではなくServer Actionsの方針だが、ページを離れる瞬間は
 * Server Actionsを呼んでも応答を待てず途中で切れてしまう。ブラウザが送り届けてくれる
 * \`navigator.sendBeacon\`はPOSTのURLしか叩けないので、ここだけRoute Handlerにしている。
 * 送れなかった場合も、ロックは操作が無ければ10分で切れる。
 */
export const POST = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const kizaihyouId = Number(id);
  if (!Number.isInteger(kizaihyouId)) return new NextResponse(null, { status: 400 });

  try {
    await stopEditing(kizaihyouId);
  } catch {
    // 外せなくても10分で切れるので、離れていくページには何も返さない
  }
  return new NextResponse(null, { status: 204 });
};
