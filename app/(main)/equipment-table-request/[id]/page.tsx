import { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { fetchEquipmentTable } from '@/app/_lib/equipment-table/funcs';

import EquipmentOrderDetail from './_ui/equipment-order-detail';

export const metadata: Metadata = {
  title: '受注明細（機材）',
  description: '機材表申請の受注明細（機材）画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const kizaihyouId = Number(id);
  if (!Number.isInteger(kizaihyouId)) notFound();

  const detail = await fetchEquipmentTable(kizaihyouId);
  if (!detail) notFound();

  return <EquipmentOrderDetail detail={detail} />;
};
export default Page;
