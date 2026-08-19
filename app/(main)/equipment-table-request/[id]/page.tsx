import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { fetchEquipmentTableForApproval, fetchEquipmentTableHistory } from '@/app/_lib/equipment-table/funcs';

import { buildStockDateRange, formatIsoDate } from './_lib/date-utils';
import { fetchEquipmentStockMap } from './_lib/funcs';
import { EquipmentStockMap } from './_lib/types';
import EquipmentOrderDetail from './_ui/equipment-order-detail';

export const metadata: Metadata = {
  title: '機材表承認',
  description: '申請された機材表を承認・差し戻しする画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const kizaihyouId = Number(id);
  if (!Number.isInteger(kizaihyouId)) notFound();

  // 表示するのは現在の内容ではなく申請時点のスナップショット（無ければ現在の内容）
  const approval = await fetchEquipmentTableForApproval(kizaihyouId);
  if (!approval) notFound();

  // 出庫日・入庫日が未設定だと在庫を出す期間が決まらないので、在庫は空で渡す
  const range = buildStockDateRange(approval.head.shippedAt, approval.head.returnedAt);
  const kizaiIds = approval.rows.map((row) => row.kizaiId).filter((kizaiId): kizaiId is number => kizaiId !== null);
  const stockMap: EquipmentStockMap = range
    ? await fetchEquipmentStockMap(kizaiIds, formatIsoDate(range.start), formatIsoDate(range.end))
    : {};

  const history = await fetchEquipmentTableHistory(kizaihyouId);

  return <EquipmentOrderDetail approval={approval} stockMap={stockMap} history={history} />;
};
export default Page;
