import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { fetchEquipmentTableSnapshotForView } from '@/app/_lib/equipment-table/funcs';

import EquipmentTableForbidden from '../../../_ui/equipment-table-forbidden';
import EquipmentTableSnapshotView from '../../../_ui/equipment-table-snapshot';

export const metadata: Metadata = {
  title: '機材表（過去の内容）',
  description: '保存・申請した時点の機材表を閲覧する画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string; hisId: string }> }) => {
  const { id, hisId } = await params;
  const kizaihyouId = Number(id);
  const historyId = Number(hisId);
  if (!Number.isInteger(kizaihyouId) || !Number.isInteger(historyId)) notFound();

  // メンバーと受注部担当者（承認画面から開く）だけが見られる
  const result = await fetchEquipmentTableSnapshotForView(historyId);
  // URLの機材表IDと履歴の機材表IDが食い違うものは開かせない
  if (!result || (!result.forbidden && result.detail.kizaihyouId !== kizaihyouId)) notFound();
  if (result.forbidden) return <EquipmentTableForbidden />;

  return <EquipmentTableSnapshotView detail={result.detail} />;
};
export default Page;
