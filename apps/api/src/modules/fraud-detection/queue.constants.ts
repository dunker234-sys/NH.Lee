export const FRAUD_DETECTION_QUEUE_NAME = 'punch-fraud-detection';

export interface FraudDetectionJobData {
  punchId: string;
  employeeId: string;
}
