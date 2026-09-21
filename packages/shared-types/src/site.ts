export interface SiteSummary {
  id: string;
  code: string;
  name: string;
  lat: number | null;
  lng: number | null;
  geofenceRadiusM: number;
  assignmentRole?: 'PRIMARY' | 'SECONDARY';
}
