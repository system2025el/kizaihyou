/**
 * 在庫数の仮の値。
 *
 * 本来はkikikanの在庫（受注・入出庫）から日別に引くべき値だが、kizaihyouは
 * まだkikikanの受注と紐づいていないため、全機材で同じ値を置いている。
 * kikikanの受注参照を実装したら、この定数ごと差し替えること。
 */
export const MOCK_BASE_STOCK = 8;
