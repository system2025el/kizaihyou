import { EquipmentOrderRow } from './types';

// モックの受注明細（機材）データ。実際のバックエンド連携・機材マスタとの連動はまだ無い。
export const EQUIPMENT_ORDER_ROWS: EquipmentOrderRow[] = [
  { id: 'kz-eq-1', kizaiName: '1kwクセノンピン(N)/20C', mem: '', mem2: '', orderedQty: 2, spareQty: 0, baseStock: 8 },
  { id: 'kz-eq-2', kizaiName: '1kw(N)ピン脚', mem: '', mem2: '', orderedQty: 2, spareQty: 0, baseStock: 8 },
  { id: 'kz-eq-3', kizaiName: '1kw(N)ピン整流器', mem: '', mem2: '', orderedQty: 2, spareQty: 0, baseStock: 8 },
  { id: 'kz-eq-4', kizaiName: '予備整流器 (1kw/ビーム)', mem: '', mem2: '', orderedQty: 1, spareQty: 0, baseStock: 2 },
  {
    id: 'kz-eq-5',
    kizaiName: '予備球 1kwクセノンピン(N) UXL-1000PR',
    mem: '',
    mem2: '',
    orderedQty: 1,
    spareQty: 0,
    baseStock: 16,
  },
];
