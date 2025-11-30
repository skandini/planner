export type Room = {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  location: string | null;
  equipment: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

