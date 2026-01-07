
export interface DeliveryLocation {
  id: string;
  address: string;
  lat: number;
  lng: number;
  status: 'pending' | 'completed';
  order: number;
}

export interface UserLocation {
  lat: number;
  lng: number;
}
