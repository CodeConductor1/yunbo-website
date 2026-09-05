/** The two devices. Each picks one identity at launch; ids must not collide. */
export type Rider = {
  id: string;
  label: string;
  color: string;
};

export const RIDERS: readonly Rider[] = [
  { id: 'rider-a', label: 'Rider A', color: '#4CC9F0' },
  { id: 'rider-b', label: 'Rider B', color: '#F7B267' },
];

export function otherRider(riderId: string): Rider | undefined {
  return RIDERS.find((r) => r.id !== riderId);
}
