import { Metadata } from 'next';

import EquipmentTableLoader from './_ui/equipment-table-loader';

export const metadata: Metadata = {
  title: '機材表',
  description: '機材表の内容を表示・編集するモック画面です',
};

const Page = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <EquipmentTableLoader id={id} />;
};
export default Page;
