import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { fetchEquipmentTableSnapshot } from '@/app/_lib/equipment-table/funcs';

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

  const detail = await fetchEquipmentTableSnapshot(historyId);
  // URLの機材表IDと履歴の機材表IDが食い違うものは開かせない
  if (!detail || detail.kizaihyouId !== kizaihyouId) notFound();

  return <EquipmentTableSnapshotView detail={detail} />;
};
export default Page;
