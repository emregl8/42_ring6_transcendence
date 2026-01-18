export interface HealthCheckResult {
  service: string;
  status: 'ok' | 'unhealthy';
  latency?: number;
  error?: string;
}

export interface HealthCheckResponse {
  status: string;
  details?: HealthCheckResult[];
}
