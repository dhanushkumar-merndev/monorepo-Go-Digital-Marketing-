import { Global, Module } from '@nestjs/common';
import { parseApiEnvironment, type ApiEnvironment } from '@gdm/config';

export const API_ENVIRONMENT = Symbol('API_ENVIRONMENT');

@Global()
@Module({
  providers: [
    {
      provide: API_ENVIRONMENT,
      useFactory: (): ApiEnvironment => parseApiEnvironment(process.env),
    },
  ],
  exports: [API_ENVIRONMENT],
})
export class ApiConfigModule {}
