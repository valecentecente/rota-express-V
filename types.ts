
export interface DeliveryLocation {
  id: string;
  address: string;
  lat: number;
  lng: number;
  status: 'pending' | 'completed';
  distanceFromOrigin?: number;
  order: number; // Campo para preservar a numeração original
}

export interface UserLocation {
  lat: number;
  lng: number;
}