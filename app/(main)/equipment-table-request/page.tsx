import { Metadata } from 'next';

import EquipmentTableRequest from './_ui/equipment-table-request';

export const metadata: Metadata = {
  title: '機材表申請依頼',
  description: '受注部担当者が機材表の申請を承認・差し戻しする画面です',
};

const Page = () => {
  return <EquipmentTableRequest />;
};
export default Page;
