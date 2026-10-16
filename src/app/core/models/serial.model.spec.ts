import type { StockMovement } from './costing.model';
import { serialMovements } from './serial.model';

describe('serialMovements (B18)', () => {
  const move = (id: number, date: string, type: StockMovement['type'], serials: string[]) =>
    ({ id, date, type, serials, note: '' }) as Pick<
      StockMovement,
      'id' | 'date' | 'type' | 'serials' | 'note'
    > as StockMovement;

  it('lists the movements of one serial, oldest first', () => {
    const moves = [
      move(3, '2026-10-12T03:00:00Z', 'receive', ['NB-1']),
      move(1, '2026-10-01T03:00:00Z', 'receive', ['NB-1', 'NB-2']),
      move(2, '2026-10-05T03:00:00Z', 'issue', ['NB-1']),
      move(4, '2026-10-13T03:00:00Z', 'issue', ['NB-2']),
    ];
    expect(serialMovements('NB-1', moves).map((m) => [m.id, m.type])).toEqual([
      [1, 'receive'],
      [2, 'issue'],
      [3, 'receive'],
    ]);
    expect(serialMovements('NB-9', moves)).toEqual([]);
  });
});
