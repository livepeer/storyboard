export interface CanvasCard {
  id: string;
  refId: string;
  type: "image" | "video" | "audio" | "stream" | "text";
  url?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  batchId?: string;
  meta?: Record<string, unknown>;
}

export class CanvasStore {
  private cards = new Map<string, CanvasCard>();

  add(card: CanvasCard): void {
    this.cards.set(card.id, card);
  }

  get(id: string): CanvasCard | undefined {
    return this.cards.get(id);
  }

  getByRefId(refId: string): CanvasCard | undefined {
    return this.list().find((c) => c.refId === refId);
  }

  remove(id: string): boolean {
    return this.cards.delete(id);
  }

  list(): CanvasCard[] {
    return [...this.cards.values()];
  }

  byBatch(batchId: string): CanvasCard[] {
    return this.list().filter((c) => c.batchId === batchId);
  }

  update(id: string, patch: Partial<CanvasCard>): void {
    const card = this.cards.get(id);
    if (!card) throw new Error(`Unknown card: ${id}`);
    this.cards.set(id, { ...card, ...patch, id });
  }

  clear(): void {
    this.cards.clear();
  }
}
