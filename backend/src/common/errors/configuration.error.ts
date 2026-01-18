import { InternalServerErrorException } from '@nestjs/common';

export class ConfigurationError extends InternalServerErrorException {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
