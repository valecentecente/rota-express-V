
export interface DeliveryLocation {
  id: string;
  address: string;
  lat: number;
  lng: number;
  status: 'pending' | 'completed';
  distanceFromOrigin?: number;
  order: number; // Numeração original da rota
}

export interface UserLocation {
  lat: number;
  lng: number;
}
