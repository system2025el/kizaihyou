import { Metadata } from 'next';

import EquipmentOrderDetail from './_ui/equipment-order-detail';

export const metadata: Metadata = {
  title: '受注明細（機材）',
  description: '機材表申請の受注明細（機材）画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <EquipmentOrderDetail id={id} />;
};
export default Page;
