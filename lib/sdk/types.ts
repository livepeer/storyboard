export interface SdkConfig {
  serviceUrl: string;
  apiKey: string;
  orchUrl: string;
}

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

export interface Capability {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

export interface InferenceRequest {
  capability: string;
  prompt: string;
  params?: Record<string, unknown>;
  image_data?: string;
}

export interface InferenceResponse {
  url?: string;
  error?: string;
  elapsed?: number;
  model?: string;
  [key: string]: unknown;
}
