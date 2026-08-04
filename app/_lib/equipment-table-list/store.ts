import { create } from 'zustand';

import { INITIAL_EQUIPMENT_TABLE_LIST } from './mock-data';
import { EquipmentTableHistoryEntry, EquipmentTableListRow, EquipmentTableStatus } from './types';

type EquipmentTableListState = {
  rows: EquipmentTableListRow[];
  addRow: (row: EquipmentTableListRow) => void;
  setStatus: (id: string, status: EquipmentTableStatus, historyEntry: EquipmentTableHistoryEntry) => void;
};

// 機材表履歴一覧・機材表申請依頼の両画面で共有するモックの状態。
// 実際のバックエンド連携はまだ無く、画面をリロードすると初期データに戻る。
export const useEquipmentTableListStore = create<EquipmentTableListState>((set) => ({
  rows: INITIAL_EQUIPMENT_TABLE_LIST,
  addRow: (row) => set((state) => ({ rows: [row, ...state.rows] })),
  setStatus: (id, status, historyEntry) =>
    set((state) => ({
      rows: state.rows.map((row) =>
        row.id === id ? { ...row, status, updatedAt: historyEntry.at, history: [...row.history, historyEntry] } : row
      ),
    })),
}));
