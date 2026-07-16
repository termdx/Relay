import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  name: string;
  version: string;
  status: 'ok';
}

@Injectable()
export class AppService {
  getHealth(): HealthStatus {
    return { name: 'relay-backend', version: '0.1.0', status: 'ok' };
  }
}
