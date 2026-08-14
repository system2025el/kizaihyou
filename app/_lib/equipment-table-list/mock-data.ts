import { EquipmentColumn, EquipmentRow } from '@/app/_lib/equipment-table/types';

import { EquipmentTableListRow, EquipmentTableStatus } from './types';

const col = (id: string, label: string): EquipmentColumn => ({ id, label });

const row = (
  id: string,
  kind: string,
  name: string,
  qty: Record<string, string>,
  remark = '',
  spare = ''
): EquipmentRow => ({ id, kind, name, remark, spare, qty });

// モックの機材表履歴データ。実際のバックエンド連携はまだ無い。
export const INITIAL_EQUIPMENT_TABLE_LIST: EquipmentTableListRow[] = [
  {
    id: 'KZ-0005',
    eventName: 'AIMYON 甲子園',
    place: '幕張/甲子園',
    clientName: 'リコライトデザイン',
    createdAt: '2026/06/29 12:20',
    updatedAt: '2026/07/23 12:20',
    shippedAt: '2026/07/28',
    returnedAt: '2026/08/08',
    status: '承認済',
    salesStaffName: '田中 一郎',
    history: [
      { at: '2026/06/29 12:20', user: '田中 一郎', action: '新規作成' },
      { at: '2026/07/20 10:00', user: '田中 一郎', action: '申請' },
      { at: '2026/07/23 12:20', user: '佐藤 花子', action: '承認' },
    ],
    content: {
      columns: [
        col('KZ-0005-col-1', '下Wing Tr外'),
        col('KZ-0005-col-2', '上Wing Tr外'),
        col('KZ-0005-col-3', '下Wing Tr内'),
        col('KZ-0005-col-4', '上Wing Tr内'),
        col('KZ-0005-col-5', '下1 Ladder'),
        col('KZ-0005-col-6', '下2 Ladder'),
      ],
      rows: [
        row('KZ-0005-row-1', '調光卓', 'スマートフェード 1248', { 'KZ-0005-col-1': '1', 'KZ-0005-col-2': '1' }),
        row('KZ-0005-row-2', 'System', 'grand MA3 ライト　(NO.19) VER 2.0.2.0', { 'KZ-0005-col-1': '1' }),
        row('KZ-0005-row-3', 'System', 'MA3 8Port Node', {}),
        row('KZ-0005-row-4', 'ケーブル', 'T-8 Ⅱ スプリッタ－', { 'KZ-0005-col-3': '2' }),
      ],
    },
  },
  {
    id: 'KZ-0004',
    eventName: '肉チョモランマ『大決戦』',
    place: 'K ARENA YOKOHAMA',
    clientName: 'エストファーム',
    createdAt: '2026/06/30 09:00',
    updatedAt: '2026/07/23 12:21',
    shippedAt: '2026/07/03',
    returnedAt: '2026/07/05',
    status: '承認済',
    salesStaffName: '佐藤 花子',
    history: [
      { at: '2026/06/30 09:00', user: '佐藤 花子', action: '新規作成' },
      { at: '2026/07/05 18:00', user: '佐藤 花子', action: '承認' },
    ],
    content: {
      columns: [
        col('KZ-0004-col-1', '1Tr'),
        col('KZ-0004-col-2', '2Tr'),
        col('KZ-0004-col-3', '3Tr'),
        col('KZ-0004-col-4', '4Tr'),
        col('KZ-0004-col-5', '5Tr'),
        col('KZ-0004-col-6', 'バルコニー下手'),
      ],
      rows: [
        row('KZ-0004-row-1', '卓', 'HOG４', { 'KZ-0004-col-1': '2' }, '', '2'),
        row('KZ-0004-row-2', '', 'Quartz', { 'KZ-0004-col-1': '2' }),
      ],
    },
  },
  {
    id: 'KZ-0003',
    eventName: '○○フェスティバル2026',
    place: '幕張メッセ',
    clientName: '△△エンタテインメント',
    createdAt: '2026/06/15 10:00',
    updatedAt: '2026/06/20 15:30',
    shippedAt: '2026/08/31',
    returnedAt: '2026/09/14',
    status: '申請中',
    salesStaffName: '鈴木 次郎',
    history: [
      { at: '2026/06/15 10:00', user: '鈴木 次郎', action: '新規作成' },
      { at: '2026/06/20 15:30', user: '鈴木 次郎', action: '申請' },
    ],
    content: {
      columns: [
        col('KZ-0003-col-1', '下Wing Tr外'),
        col('KZ-0003-col-2', '上Wing Tr外'),
        col('KZ-0003-col-3', 'Stage後方'),
      ],
      rows: [
        row('KZ-0003-row-1', 'ムービングライト', 'MAC ONE /TRUE1', { 'KZ-0003-col-1': '4', 'KZ-0003-col-2': '4' }),
        row('KZ-0003-row-2', 'ムービングライト', 'SHARPY PLUS', { 'KZ-0003-col-3': '6' }),
      ],
    },
  },
  {
    id: 'KZ-0002',
    eventName: '□□コンサートツアー',
    place: '日本武道館',
    clientName: '××プロダクション',
    createdAt: '2026/05/10 11:00',
    updatedAt: '2026/05/12 09:00',
    shippedAt: null,
    returnedAt: null,
    status: '作成中',
    salesStaffName: '高橋 美咲',
    history: [{ at: '2026/05/10 11:00', user: '高橋 美咲', action: '新規作成' }],
    content: {
      columns: [col('KZ-0002-col-1', 'Stage'), col('KZ-0002-col-2', 'FOH')],
      rows: [row('KZ-0002-row-1', '卓', 'Quartz', { 'KZ-0002-col-2': '1' })],
    },
  },
  {
    id: 'KZ-0001',
    eventName: 'サンプル公演',
    place: 'テストホール',
    clientName: 'サンプル株式会社',
    createdAt: '2026/04/01 09:00',
    updatedAt: '2026/04/01 09:00',
    shippedAt: '2026/04/10',
    returnedAt: '2026/04/12',
    status: '差戻し',
    salesStaffName: '伊藤 健太',
    history: [
      { at: '2026/04/01 09:00', user: '伊藤 健太', action: '新規作成' },
      { at: '2026/04/10 10:00', user: '伊藤 健太', action: '申請' },
      { at: '2026/04/12 17:00', user: '田中 一郎', action: '差戻し' },
    ],
    content: {
      columns: [col('KZ-0001-col-1', 'Stage')],
      rows: [row('KZ-0001-row-1', '照明', 'Rush Par', { 'KZ-0001-col-1': '8' })],
    },
  },
];

export const STATUS_COLOR: Record<EquipmentTableStatus, 'default' | 'info' | 'error' | 'success'> = {
  作成中: 'default',
  申請中: 'info',
  差戻し: 'error',
  承認済: 'success',
};
